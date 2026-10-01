/*
 * assist.c: the inspection aircraft's autopilot, between the sticks and
 * Betaflight.
 *
 * WHAT THIS IS. A confined space inspection aircraft is not flown the way a
 * racer is. Its own flight controller holds position off a LiDAR SLAM fix,
 * holds height, limits speed, and turns the sticks into velocity requests,
 * and the pilot's job is the inspection rather than the hover. This file is
 * that layer for the simulator. It reads the plant's own state, which is
 * the perfect SLAM fix, and writes the RC frame Betaflight sees, with
 * Betaflight in angle mode underneath it. Betaflight is still the inner
 * loop: nothing here touches rates, PIDs or the mixer, which is CLAUDE.md's
 * rule that the controller is ported and not written. This is the outer
 * loop a real aircraft of this class runs above its attitude controller.
 *
 * MODES (sim_set_assist):
 *   0  off. The pilot's sticks reach Betaflight untouched. The default, and
 *      the only mode the verification harness ever sees.
 *   1  POSITION. Right stick is a horizontal velocity request in the
 *      aircraft's heading frame, left stick vertical is a climb rate, left
 *      stick horizontal is yaw rate through the tune's rates. Sticks centred
 *      hold position and height.
 *   2  ATTI. Right stick is a lean angle, so the aircraft drifts with what
 *      it carries, the way it does when the SLAM fix is lost. Height is
 *      still held. This is the mode inspection pilots are trained to
 *      recover in.
 *
 * THE VIRTUAL CAGE (sim_set_assist_guard). An uncaged aircraft of the
 * tethered class stops itself short of a surface off its LiDAR. Every step,
 * the static shapes within reach (world_proximity) cap the velocity request
 * toward each one, so the aircraft decelerates into a standoff and is
 * pushed gently back out of it. 0 is off, which is the caged aircraft: it
 * is built to touch.
 *
 * DETERMINISM. Only IEEE arithmetic, sim_sqrt, and a fixed series for
 * atan, so the same input stream gives the same RC frames on every engine.
 * No frame time reaches here: the loop runs on the step clock and emits a
 * fresh RC frame every ASSIST_RC_DIV steps, 250 Hz, like a receiver.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

#include "sim_abi.h"
#include "sim_internal.h"
#include "libm/sim_math.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define SIM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SIM_EXPORT
#endif

#define ASSIST_RC_DIV 4
#define ASSIST_DEADBAND 0.06
#define ASSIST_DEG (180.0 / 3.14159265358979323846)
#define ASSIST_MAX_NEAR 16

/* Gains. Chosen for a first order velocity response near half a second on
 * the caged aircraft, which is what the class feels like on a video: it
 * leans, gathers, and settles without overshoot. Every one is a FEEL
 * constant and moves when a pilot says so. */
#define K_VEL 1.8        /* 1/s, velocity error to acceleration */
#define K_VEL_I 0.25     /* 1/s^2, velocity integrator, wind and trim */
#define K_POS 0.9        /* 1/s, position error to velocity, in a hold */
#define V_HOLD_MAX 0.6   /* m/s, the most a hold will ask for */
#define K_VZ 2.5         /* 1/s, climb rate error to vertical acceleration */
#define K_VZ_I 1.2       /* 1/s^2, the hover estimate's adaptation */
#define K_Z 1.2          /* 1/s, height error to climb rate, in a hold */
#define K_GUARD 1.4      /* 1/s, standoff error to closing speed */
#define V_GUARD_PUSH 0.5 /* m/s, the most the cage pushes back out */
#define HOLD_CAPTURE_V 0.25 /* m/s: a hold is taken once the craft is this slow */

typedef struct {
  int mode;
  double v_h;         /* m/s, full stick horizontal */
  double v_up;        /* m/s, full stick climb */
  double v_down;      /* m/s, full stick descent */
  double tilt_max;    /* rad, the most lean the loop will ask for */
  double angle_limit; /* rad, the tune's angle_limit: full stick in angle mode */
  double hover;       /* throttle that hovers, the starting estimate */
  double guard;       /* m, virtual cage standoff from the hull, 0 off */
} AssistConfig;

static AssistConfig g_cfg = { 0, 1.0, 1.0, 0.8, 0.35, 0.785398, 0.45, 0.0 };

typedef struct {
  int flying;
  int hold_xy;
  int hold_z;
  double hold[3];
  double vi[2];       /* horizontal velocity integrator, m/s^2 */
  double zi;          /* vertical integrator, m/s^2 */
  int settle_ms;      /* ground contact while descending, toward landed */
  double rc[4];       /* the last RC frame emitted */
  /* For the report. */
  double near_d;
  int guard_on;
  double vz_cmd;
  double thr_out;
} AssistState;

static AssistState A;

int assist_active(void) { return g_cfg.mode != 0; }

void assist_reset(void) {
  A.flying = 0;
  A.hold_xy = 0;
  A.hold_z = 0;
  A.hold[0] = 0.0;
  A.hold[1] = 0.0;
  A.hold[2] = 0.0;
  A.vi[0] = 0.0;
  A.vi[1] = 0.0;
  A.zi = 0.0;
  A.settle_ms = 0;
  A.rc[0] = 0.0;
  A.rc[1] = 0.0;
  A.rc[2] = 0.0;
  A.rc[3] = 0.0;
  A.near_d = -1.0;
  A.guard_on = 0;
  A.vz_cmd = 0.0;
  A.thr_out = 0.0;
}

static double clampd(double x, double lo, double hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

static double absd(double x) { return x < 0.0 ? -x : x; }

/* A stick past the deadband, rescaled so the edge of the band is zero. */
static double stick(double x) {
  const double a = absd(x);
  if (a <= ASSIST_DEADBAND) {
    return 0.0;
  }
  const double r = (a - ASSIST_DEADBAND) / (1.0 - ASSIST_DEADBAND);
  return x < 0.0 ? -r : r;
}

/* atan for |x| <= 1 by Euler's transformed series, whose ratio of terms
 * is x^2 / (1 + x^2) times (2k / (2k + 1)), so it is at most a half; outside
 * that, pi/2 - atan(1/x). Twenty terms are under 1e-6 rad at x = 1 and far
 * smaller at the leans this loop actually asks for, below anything
 * Betaflight's angle loop resolves, and every term is an IEEE operation. */
static double atan_det(double x) {
  const double ax = absd(x);
  if (ax > 1.0) {
    const double r = 1.5707963267948966 - atan_det(1.0 / ax);
    return x < 0.0 ? -r : r;
  }
  const double y = (ax * ax) / (1.0 + ax * ax);
  double term = ax / (1.0 + ax * ax);
  double sum = term;
  for (int k = 1; k < 20; k += 1) {
    term *= y * (2.0 * k) / (2.0 * k + 1.0);
    sum += term;
  }
  return x < 0.0 ? -sum : sum;
}

/* Clamp a 2 vector's length. */
static void clamp2(double v[2], double max) {
  const double l = sim_sqrt(v[0] * v[0] + v[1] * v[1]);
  if (l > max && l > 1e-12) {
    v[0] *= max / l;
    v[1] *= max / l;
  }
}

/* The hull's extent along a world direction, near level. */
static double hull_along(const double n[3]) {
  const double h = absd(n[0]) * PLANT.hull_hx + absd(n[1]) * PLANT.hull_hy;
  const double v = n[2] > 0.0 ? n[2] * PLANT.hull_hz_down : -n[2] * PLANT.hull_hz_up;
  return h + v;
}

/*
 * Cap a velocity request against every surface in reach. n points out of
 * the surface toward the craft, so v.n < 0 is closing. The closing speed
 * allowed falls linearly to zero at the standoff and turns into a push
 * back out inside it.
 */
static void guard_apply(const SimState *s, double v[3]) {
  A.guard_on = 0;
  A.near_d = -1.0;
  if (!(g_cfg.guard > 0.0)) {
    return;
  }
  double n[ASSIST_MAX_NEAR][3];
  double d[ASSIST_MAX_NEAR];
  const double reach = PLANT.hull_hx + PLANT.hull_hy + g_cfg.guard + 1.5;
  const int k = world_proximity(s->pos, reach, n, d, ASSIST_MAX_NEAR);
  for (int i = 0; i < k; i += 1) {
    const double clear = d[i] - hull_along(n[i]);
    if (A.near_d < 0.0 || clear < A.near_d) {
      A.near_d = clear;
    }
    const double vn = v[0] * n[i][0] + v[1] * n[i][1] + v[2] * n[i][2];
    double vn_min;
    if (clear < g_cfg.guard) {
      vn_min = clampd(K_GUARD * (g_cfg.guard - clear), 0.0, V_GUARD_PUSH);
    } else {
      vn_min = -K_GUARD * (clear - g_cfg.guard);
    }
    if (vn < vn_min) {
      const double dv = vn_min - vn;
      v[0] += n[i][0] * dv;
      v[1] += n[i][1] * dv;
      v[2] += n[i][2] * dv;
      A.guard_on = 1;
    }
  }
}

int assist_run(const SimState *s, const double pilot[4], double rc_out[4], int on_ground) {
  const int fresh = (s->step_index % ASSIST_RC_DIV) == 0;
  if (!fresh) {
    rc_out[0] = A.rc[0];
    rc_out[1] = A.rc[1];
    rc_out[2] = A.rc[2];
    rc_out[3] = A.rc[3];
    return 0;
  }
  const double dt = (double)ASSIST_RC_DIV / (double)SIM_STEP_HZ;
  const double g = PLANT.gravity * SIM_GRAVITY;

  /* Heading frame: the body x axis laid flat. */
  const double qw = s->quat[0];
  const double qx = s->quat[1];
  const double qy = s->quat[2];
  const double qz = s->quat[3];
  double fx = 1.0 - 2.0 * (qy * qy + qz * qz);
  double fy = 2.0 * (qx * qy + qw * qz);
  double fl = sim_sqrt(fx * fx + fy * fy);
  if (fl < 1e-6) {
    fx = 1.0;
    fy = 0.0;
    fl = 1.0;
  }
  fx /= fl;
  fy /= fl;
  const double lx = -fy; /* left */
  const double ly = fx;
  const double cos_tilt = 1.0 - 2.0 * (qx * qx + qy * qy);

  const double s_roll = stick(pilot[0]);
  const double s_pitch = stick(pilot[1]);
  const double s_thr = stick((pilot[3] - 0.5) * 2.0);

  /* ON THE GROUND. The motors idle until the pilot asks to climb, which is
   * how an aircraft of this class takes off: it does not lift on a centred
   * stick. Holds and integrators start clean from here. */
  if (!A.flying) {
    if (s_thr > 0.15) {
      A.flying = 1;
      A.hold_xy = 0;
      A.hold_z = 0;
      A.vi[0] = 0.0;
      A.vi[1] = 0.0;
      A.zi = 0.0;
      A.settle_ms = 0;
    } else {
      A.rc[0] = 0.0;
      A.rc[1] = 0.0;
      A.rc[2] = pilot[2];
      A.rc[3] = 0.0;
      A.vz_cmd = 0.0;
      A.thr_out = 0.0;
      guard_apply(s, (double[3]){ 0.0, 0.0, 0.0 });
      rc_out[0] = A.rc[0];
      rc_out[1] = A.rc[1];
      rc_out[2] = A.rc[2];
      rc_out[3] = A.rc[3];
      return 1;
    }
  }

  /* Velocity request, world frame. */
  double v_des[3] = { 0.0, 0.0, 0.0 };
  const int sticks_h = (s_roll != 0.0 || s_pitch != 0.0);
  const double vh_now = sim_sqrt(s->vel[0] * s->vel[0] + s->vel[1] * s->vel[1]);
  if (g_cfg.mode == 1) {
    if (sticks_h) {
      A.hold_xy = 0;
      /* +pitch on the ABI's channel is the stick pulled BACK, so forward
       * is its negative. It was s_pitch until 2026-10-01, and forward
       * stick flew the aircraft backwards: see PROGRESS.md. */
      const double fwd = -s_pitch * g_cfg.v_h;
      const double left = -s_roll * g_cfg.v_h;
      v_des[0] = fwd * fx + left * lx;
      v_des[1] = fwd * fy + left * ly;
    } else {
      if (!A.hold_xy && vh_now < HOLD_CAPTURE_V) {
        A.hold_xy = 1;
        A.hold[0] = s->pos[0];
        A.hold[1] = s->pos[1];
      }
      if (A.hold_xy) {
        double e[2] = { K_POS * (A.hold[0] - s->pos[0]), K_POS * (A.hold[1] - s->pos[1]) };
        clamp2(e, V_HOLD_MAX);
        v_des[0] = e[0];
        v_des[1] = e[1];
      }
    }
  }
  if (s_thr != 0.0) {
    A.hold_z = 0;
    v_des[2] = s_thr > 0.0 ? s_thr * g_cfg.v_up : s_thr * g_cfg.v_down;
  } else {
    if (!A.hold_z && absd(s->vel[2]) < HOLD_CAPTURE_V) {
      A.hold_z = 1;
      A.hold[2] = s->pos[2];
    }
    if (A.hold_z) {
      v_des[2] = clampd(K_Z * (A.hold[2] - s->pos[2]), -V_HOLD_MAX, V_HOLD_MAX);
    }
  }
  guard_apply(s, v_des);
  /* A hold the cage pushed off is a hold at the new place. */
  if (A.guard_on) {
    A.hold_xy = 0;
    A.hold_z = 0;
  }
  A.vz_cmd = v_des[2];

  /* Horizontal: velocity loop to an acceleration, to a lean. */
  double lean_fwd;
  double lean_right;
  if (g_cfg.mode == 1 || A.guard_on) {
    const double amax = g * g_cfg.tilt_max; /* small angle; the lean is clamped below */
    const double ex = v_des[0] - s->vel[0];
    const double ey = v_des[1] - s->vel[1];
    A.vi[0] = clampd(A.vi[0] + K_VEL_I * ex * dt, -1.0, 1.0);
    A.vi[1] = clampd(A.vi[1] + K_VEL_I * ey * dt, -1.0, 1.0);
    double a[2] = { K_VEL * ex + A.vi[0], K_VEL * ey + A.vi[1] };
    clamp2(a, amax);
    const double a_fwd = a[0] * fx + a[1] * fy;
    const double a_left = a[0] * lx + a[1] * ly;
    lean_fwd = atan_det(a_fwd / g);
    lean_right = atan_det(-a_left / g);
  } else {
    lean_fwd = -s_pitch * g_cfg.tilt_max;
    lean_right = s_roll * g_cfg.tilt_max;
  }
  lean_fwd = clampd(lean_fwd, -g_cfg.tilt_max, g_cfg.tilt_max);
  lean_right = clampd(lean_right, -g_cfg.tilt_max, g_cfg.tilt_max);

  /* Vertical: climb rate loop to an acceleration, to a throttle. Thrust
   * goes roughly as throttle squared on a fixed pitch prop, so the hover
   * estimate scales by the square root, and a lean is paid for by 1/cos. */
  const double ez = v_des[2] - s->vel[2];
  A.zi = clampd(A.zi + K_VZ_I * ez * dt, -0.5 * g, 0.5 * g);
  const double az = clampd(K_VZ * ez + A.zi, -0.6 * g, 0.8 * g);
  double ct = cos_tilt < 0.5 ? 0.5 : cos_tilt;
  double thr = g_cfg.hover * sim_sqrt((1.0 + az / g) / ct);
  thr = clampd(thr, 0.05, 1.0);

  /* LANDING. Down stick on the ground for a third of a second, or resting
   * there with the stick centred and nothing to hold, and the motors idle. */
  if (on_ground && v_des[2] <= 0.0 && s->vel[2] > -0.3) {
    A.settle_ms += ASSIST_RC_DIV;
    if (A.settle_ms >= 300) {
      A.flying = 0;
      A.hold_xy = 0;
      A.hold_z = 0;
      thr = 0.0;
    }
  } else {
    A.settle_ms = 0;
  }
  A.thr_out = thr;

  /* Angle mode: full stick is the tune's angle_limit, and +pitch on the
   * ABI's channel is nose UP. */
  A.rc[0] = clampd(lean_right / g_cfg.angle_limit, -1.0, 1.0);
  A.rc[1] = clampd(-lean_fwd / g_cfg.angle_limit, -1.0, 1.0);
  A.rc[2] = pilot[2];
  A.rc[3] = thr;
  rc_out[0] = A.rc[0];
  rc_out[1] = A.rc[1];
  rc_out[2] = A.rc[2];
  rc_out[3] = A.rc[3];
  return 1;
}

/*
 * The ABI, all additive: a host that never calls these steps exactly as
 * before.
 *
 * sim_set_assist(mode, v_h, v_up, v_down, tilt_max_deg, angle_limit_deg,
 *                hover)
 *   mode 0 off, 1 position, 2 atti. Speeds in m/s, positive. tilt_max is
 *   the most lean the loop asks for and must not exceed angle_limit, which
 *   is the angle_limit the loaded tune gives angle mode. hover is the
 *   throttle the airframe hovers at, the integrator's starting point.
 *   Setting a mode forces Betaflight's angle mode on; setting 0 leaves the
 *   controller in whatever mode the host last asked for.
 *
 * sim_set_assist_guard(standoff)
 *   The virtual cage: metres of standoff from the hull, 0 off.
 *
 * sim_assist_report(out)
 *   Nine doubles: mode, flying, hold_xy, hold_z, nearest surface clearance
 *   from the hull (-1 none in reach or guard off), guard acting, climb
 *   request m/s, throttle emitted, hover estimate (throttle).
 */
SIM_EXPORT int sim_set_assist(int mode, double v_h, double v_up, double v_down,
                              double tilt_max_deg, double angle_limit_deg, double hover) {
  if (mode < 0 || mode > 2) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(v_h > 0.0 && v_h <= 10.0) || !(v_up > 0.0 && v_up <= 5.0)
      || !(v_down > 0.0 && v_down <= 5.0) || !(angle_limit_deg >= 10.0 && angle_limit_deg <= 85.0)
      || !(tilt_max_deg > 0.0 && tilt_max_deg <= angle_limit_deg) || !(hover > 0.05 && hover < 0.95)) {
    return SIM_ERR_BAD_ARG;
  }
  const int was = g_cfg.mode;
  g_cfg.mode = mode;
  g_cfg.v_h = v_h;
  g_cfg.v_up = v_up;
  g_cfg.v_down = v_down;
  g_cfg.tilt_max = tilt_max_deg / ASSIST_DEG;
  g_cfg.angle_limit = angle_limit_deg / ASSIST_DEG;
  g_cfg.hover = hover;
  if (mode != 0) {
    bridge_set_angle_mode(1);
  }
  if (was == 0 && mode != 0) {
    assist_reset();
  }
  return SIM_OK;
}

SIM_EXPORT int sim_set_assist_guard(double standoff) {
  if (!(standoff >= 0.0 && standoff <= 3.0)) {
    return SIM_ERR_BAD_ARG;
  }
  g_cfg.guard = standoff;
  return SIM_OK;
}

SIM_EXPORT int sim_assist_report(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  out[0] = (double)g_cfg.mode;
  out[1] = (double)A.flying;
  out[2] = (double)A.hold_xy;
  out[3] = (double)A.hold_z;
  out[4] = A.near_d;
  out[5] = (double)A.guard_on;
  out[6] = A.vz_cmd;
  out[7] = A.thr_out;
  out[8] = g_cfg.hover * (1.0 + A.zi / (PLANT.gravity * SIM_GRAVITY));
  return SIM_OK;
}
