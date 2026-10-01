/*
 * tether.c: the tethered inspection aircraft's cable, inside the plant.
 *
 * WHAT IT IS. An aircraft of the Scout 137 class flies on a power and data
 * tether from a ground station. The cable has weight, it drags through the
 * air, it lies on the floor, it drapes over the coil and snags round the
 * column, and when it is snagged or all paid out it holds the aircraft
 * back. The owner approved it into the plant on 2026-10-01 (PROGRESS.md):
 * the tethered airframe only, off unless the shell turns it on, so a module
 * whose tether is never turned on steps bit identically to one without this
 * file, which scripts/plant-golden.js holds.
 *
 * HOW. A chain of TETHER_SEGS segments: node 0 is the anchor at the ground
 * station and never moves, nodes 1 to TETHER_SEGS - 1 are point masses, and
 * the last node is the attach point on the aircraft. Each 1 ms step, after
 * the plant and the world have moved the aircraft:
 *
 *   1. The free nodes take gravity and quadratic air drag and move.
 *   2. The cable is a rope, not a rod: a segment can go slack but not
 *      longer than its share of the length. TETHER_ITER passes of position
 *      based projection hold that, the aircraft's end weighted by the
 *      aircraft's mass so a light cable cannot drag a heavy aircraft
 *      about, and each node is also held within its own length of cable
 *      from the anchor (a long range constraint), which keeps a long chain
 *      from stretching under a few passes.
 *   3. Nodes are pushed out of the floor and every static shape, by
 *      world_tether_push, after the projection, and a node that
 *      touched something keeps only TETHER_SLIDE of its sliding speed. That
 *      friction is what makes a cable over the coil a snag rather than a
 *      pulley.
 *   4. Whatever the projection moved the aircraft's end by is applied to the
 *      aircraft: its position, its velocity (the move over the step), and
 *      the moment of that impulse about the CG at the attach point.
 *
 * Plant frame throughout, SI, the fixed libm's sqrt only, no frame time.
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
#include <emscripten.h>
#define SIM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SIM_EXPORT
#endif

#define TETHER_SEGS SIM_TETHER_SEGS
#define TETHER_ITER 12
/* A power and data tether of this class: about 5 mm across, 25 g a metre. */
#define TETHER_KG_PER_M 0.025
#define TETHER_DIAM 0.005
#define TETHER_CD 1.2
#define AIR_RHO 1.225
/* The radius a node keeps off a surface: the cable's own, and a little. */
#define TETHER_NODE_R 0.006
/* The share of its sliding speed a node in contact keeps each step. */
#define TETHER_SLIDE 0.85
/* Where the cable leaves the aircraft, body frame, metres: the back of the
 * airframe on the centre line, level with the CG. */
static const double ATTACH_B[3] = { -0.12, 0.0, 0.0 };

static int g_on = 0;
static double g_anchor[3];
static double g_len = 0.0;
static double g_seg = 0.0;
static double g_x[TETHER_SEGS + 1][3];
static double g_v[TETHER_SEGS + 1][3];
static double g_tension = 0.0;
static int g_touching = 0;

/* Body to world rotation from the state's quaternion, as rows. */
static void rot(const double q[4], double R[3][3]) {
  const double w = q[0];
  const double x = q[1];
  const double y = q[2];
  const double z = q[3];
  R[0][0] = 1.0 - 2.0 * (y * y + z * z);
  R[0][1] = 2.0 * (x * y - w * z);
  R[0][2] = 2.0 * (x * z + w * y);
  R[1][0] = 2.0 * (x * y + w * z);
  R[1][1] = 1.0 - 2.0 * (x * x + z * z);
  R[1][2] = 2.0 * (y * z - w * x);
  R[2][0] = 2.0 * (x * z - w * y);
  R[2][1] = 2.0 * (y * z + w * x);
  R[2][2] = 1.0 - 2.0 * (x * x + y * y);
}

static void attach_point(const SimState *s, double out[3]) {
  double R[3][3];
  rot(s->quat, R);
  for (int i = 0; i < 3; i += 1) {
    out[i] = s->pos[i] + R[i][0] * ATTACH_B[0] + R[i][1] * ATTACH_B[1] + R[i][2] * ATTACH_B[2];
  }
}

/* On, and the aircraft in the plant is the tethered one. A host that
 * switches airframe with the cable on gets no cable until it switches
 * back. */
static int live(void) {
  return g_on && plant_airframe() == SIM_AIRFRAME_TETHERED;
}

void tether_lay(const SimState *s) {
  if (!live()) {
    return;
  }
  double p[3];
  attach_point(s, p);
  const double d[3] = { p[0] - g_anchor[0], p[1] - g_anchor[1], p[2] - g_anchor[2] };
  const double dist = sim_sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  /* A cable laid shorter than the distance it has to span is laid at that
   * distance, so a teleport never yanks the aircraft back. */
  const double len = g_len > dist * 1.0001 ? g_len : dist * 1.0001;
  g_seg = len / (double)TETHER_SEGS;
  for (int i = 0; i <= TETHER_SEGS; i += 1) {
    const double u = (double)i / (double)TETHER_SEGS;
    for (int k = 0; k < 3; k += 1) {
      g_x[i][k] = g_anchor[k] + d[k] * u;
      g_v[i][k] = 0.0;
    }
  }
  g_tension = 0.0;
  g_touching = 0;
}

/* Push a node out of the floor and the world. Returns 1 if it touched,
 * writing the summed normal. */
static int collide(double p[3], int ground_on, const double gn[3], double gd, double n[3]) {
  int hit = world_tether_push(p, TETHER_NODE_R, n);
  if (ground_on) {
    const double h = gn[0] * p[0] + gn[1] * p[1] + gn[2] * p[2] - gd;
    if (h < TETHER_NODE_R) {
      const double push = TETHER_NODE_R - h;
      for (int k = 0; k < 3; k += 1) {
        p[k] += gn[k] * push;
        n[k] += gn[k];
      }
      hit += 1;
    }
  }
  return hit > 0;
}

/* Hold a pair no further apart than rest, sharing the move by inverse
 * mass. wa or wb may be 0 for a fixed end. */
static void hold(double a[3], double b[3], double wa, double wb, double rest) {
  const double d[3] = { b[0] - a[0], b[1] - a[1], b[2] - a[2] };
  const double l = sim_sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  if (!(l > rest) || !(wa + wb > 0.0)) {
    return;
  }
  const double c = (l - rest) / (l * (wa + wb));
  for (int k = 0; k < 3; k += 1) {
    a[k] += wa * c * d[k];
    b[k] -= wb * c * d[k];
  }
}

void tether_step(SimState *s, int ground_on, const double gn[3], double gd) {
  if (!live()) {
    return;
  }
  const double dt = SIM_DT;
  const double m_node = TETHER_KG_PER_M * g_seg;
  const double w_node = 1.0 / m_node;
  const double w_craft = 1.0 / PLANT.mass_kg;
  const double k_drag = 0.5 * AIR_RHO * TETHER_CD * TETHER_DIAM * g_seg / m_node;
  const double g = PLANT.gravity * SIM_GRAVITY;
  double prev[TETHER_SEGS + 1][3];
  int touch[TETHER_SEGS + 1];
  double tn[TETHER_SEGS + 1][3];

  /* 1. Gravity and drag, then move. The drag is taken implicitly, so a
   * light node at speed never overshoots to a reversed velocity. */
  for (int i = 1; i < TETHER_SEGS; i += 1) {
    g_v[i][2] -= g * dt;
    const double sp = sim_sqrt(g_v[i][0] * g_v[i][0] + g_v[i][1] * g_v[i][1] + g_v[i][2] * g_v[i][2]);
    const double keep = 1.0 / (1.0 + k_drag * sp * dt);
    for (int k = 0; k < 3; k += 1) {
      g_v[i][k] *= keep;
      prev[i][k] = g_x[i][k];
      g_x[i][k] += g_v[i][k] * dt;
    }
    touch[i] = 0;
  }
  /* The aircraft's end is wherever the plant and the world put it. */
  double craft0[3];
  attach_point(s, craft0);
  for (int k = 0; k < 3; k += 1) {
    g_x[TETHER_SEGS][k] = craft0[k];
    g_x[0][k] = g_anchor[k];
  }

  /* 2 and 3. The rope, then the surfaces. Once a step, after the
   * projection: a pass before it as well cost as much again (measured,
   * 69 against 36 microseconds a step in the tank) and changed nothing the
   * checks can see, because a node the rope pulls into a surface is pushed
   * back out of it in the same step either way. */
  for (int it = 0; it < TETHER_ITER; it += 1) {
    for (int i = 0; i < TETHER_SEGS; i += 1) {
      const double wa = i == 0 ? 0.0 : w_node;
      const double wb = i + 1 == TETHER_SEGS ? w_craft : w_node;
      hold(g_x[i], g_x[i + 1], wa, wb, g_seg);
    }
    for (int i = 1; i <= TETHER_SEGS; i += 1) {
      hold(g_x[0], g_x[i], 0.0, i == TETHER_SEGS ? w_craft : w_node, g_seg * (double)i);
    }
  }
  for (int i = 1; i < TETHER_SEGS; i += 1) {
    double n[3];
    if (collide(g_x[i], ground_on, gn, gd, n)) {
      touch[i] = 1;
      tn[i][0] = n[0];
      tn[i][1] = n[1];
      tn[i][2] = n[2];
    }
  }

  /* Velocities from the move, and friction where a node touched. */
  int touching = 0;
  for (int i = 1; i < TETHER_SEGS; i += 1) {
    for (int k = 0; k < 3; k += 1) {
      g_v[i][k] = (g_x[i][k] - prev[i][k]) / dt;
    }
    if (touch[i]) {
      touching += 1;
      const double nl = sim_sqrt(tn[i][0] * tn[i][0] + tn[i][1] * tn[i][1] + tn[i][2] * tn[i][2]);
      if (nl > 1e-9) {
        const double n[3] = { tn[i][0] / nl, tn[i][1] / nl, tn[i][2] / nl };
        const double vn = g_v[i][0] * n[0] + g_v[i][1] * n[1] + g_v[i][2] * n[2];
        for (int k = 0; k < 3; k += 1) {
          const double vnk = vn * n[k];
          /* Into the surface goes; along it keeps TETHER_SLIDE. */
          g_v[i][k] = (vn < 0.0 ? 0.0 : vnk) + (g_v[i][k] - vnk) * TETHER_SLIDE;
        }
      }
    }
  }
  g_touching = touching;

  /* 4. The aircraft's end: what the rope moved it by is the cable's pull. */
  const double dp[3] = {
    g_x[TETHER_SEGS][0] - craft0[0],
    g_x[TETHER_SEGS][1] - craft0[1],
    g_x[TETHER_SEGS][2] - craft0[2],
  };
  const double dl = sim_sqrt(dp[0] * dp[0] + dp[1] * dp[1] + dp[2] * dp[2]);
  if (dl > 0.0) {
    const double m = PLANT.mass_kg;
    double J[3];
    for (int k = 0; k < 3; k += 1) {
      s->pos[k] += dp[k];
      s->vel[k] += dp[k] / dt;
      J[k] = m * dp[k] / dt;
    }
    /* Its moment about the CG, in the body frame: b x (R^T J). */
    double R[3][3];
    rot(s->quat, R);
    double Jb[3];
    for (int i = 0; i < 3; i += 1) {
      Jb[i] = R[0][i] * J[0] + R[1][i] * J[1] + R[2][i] * J[2];
    }
    const double L[3] = {
      ATTACH_B[1] * Jb[2] - ATTACH_B[2] * Jb[1],
      ATTACH_B[2] * Jb[0] - ATTACH_B[0] * Jb[2],
      ATTACH_B[0] * Jb[1] - ATTACH_B[1] * Jb[0],
    };
    for (int k = 0; k < 3; k += 1) {
      s->omega[k] += L[k] / PLANT.inertia[k];
    }
  }
  g_tension = PLANT.mass_kg * dl / (dt * dt);
  /* The drawn end follows the aircraft as it now is. */
  attach_point(s, g_x[TETHER_SEGS]);
}

SIM_EXPORT int sim_set_tether(int on, double ax, double ay, double az, double length) {
  SimState *s = sim_state_ptr();
  if (s == 0) {
    return SIM_ERR_BAD_STATE;
  }
  if (!on) {
    g_on = 0;
    g_tension = 0.0;
    g_touching = 0;
    return SIM_OK;
  }
  if (!(ax == ax && ax - ax == 0.0) || !(ay == ay && ay - ay == 0.0) || !(az == az && az - az == 0.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(length >= 1.0) || !(length <= 200.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (plant_airframe() != SIM_AIRFRAME_TETHERED) {
    return SIM_ERR_BAD_STATE;
  }
  g_on = 1;
  g_anchor[0] = ax;
  g_anchor[1] = ay;
  g_anchor[2] = az;
  g_len = length;
  tether_lay(s);
  return SIM_OK;
}

SIM_EXPORT int sim_tether_state(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  if (!live()) {
    return 0;
  }
  for (int i = 0; i <= TETHER_SEGS; i += 1) {
    out[3 * i] = g_x[i][0];
    out[3 * i + 1] = g_x[i][1];
    out[3 * i + 2] = g_x[i][2];
  }
  out[3 * (TETHER_SEGS + 1)] = g_tension;
  out[3 * (TETHER_SEGS + 1) + 1] = (double)g_touching;
  out[3 * (TETHER_SEGS + 1) + 2] = g_seg * (double)TETHER_SEGS;
  return TETHER_SEGS + 1;
}
