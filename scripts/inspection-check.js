/*
 * inspection-check.js: fly the inspection aircraft headless under
 * src/native/assist.c and print what they do.
 *
 * For each of the caged and the tethered aircraft: a takeoff, a hold, a
 * full stick run forward and the stop, a run sideways, a yaw, the same in
 * ATTI, and a wall approach, once with the virtual cage on and once with it
 * off. It MEASURES. The bands it asserts are the ones a pilot of this class
 * would call broken, not a tune: a hold that wanders more than a hand's
 * width, a run that overshoots its stop by more than half a metre, a
 * guarded aircraft that touches the wall, a caged aircraft that does not
 * come off a wall flying.
 *
 * Usage, from the simulator root:  node scripts/inspection-check.js
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { airframeById } from '../configs/airframes.js';
import { ratesDiff } from '../configs/rates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = await readFile(join(root, 'dist/sim.wasm'));
const RAD = 180 / Math.PI;

const S = { T: 0, X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6, QW: 7, QX: 8, QY: 9, QZ: 10, P: 11, Q: 12, R: 13 };

async function rig(af, mode, guard, world) {
  const sim = await loadSim(wasm);
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  const tune = await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
  must(sim.init(tune + ratesDiff(af.rates)), 'sim_init');
  sim.setCellVoltage(af.packVoltages[0]);
  const a = af.assist;
  must(sim.e.sim_set_assist(mode, a.speeds[a.defaultSpeed], a.vUp, a.vDown, a.tiltMax, a.angleLimit, a.hover),
    'sim_set_assist');
  must(sim.e.sim_set_assist_guard(guard), 'sim_set_assist_guard');
  if (world) {
    must(sim.e.sim_world_clear(), 'sim_world_clear');
    must(sim.e.sim_world_frame(0, 0, 0, 0), 'sim_world_frame');
    for (const b of world) {
      const i = sim.e.sim_world_box(...b, 0.3, 0.4);
      if (i < 0) {
        throw new Error(`sim_world_box returned ${i}`);
      }
    }
    must(sim.e.sim_world_build(), 'sim_world_build');
  }
  const rep = sim.e.malloc(9 * 8);
  let t = 0;
  const fly = (secs, sticks, each) => {
    const n = Math.round(secs * 250);
    for (let k = 0; k < n; k += 1) {
      t += 0.004;
      sim.input(t, sticks[0], sticks[1], sticks[2], sticks[3]);
      sim.step(4);
      if (each) {
        each(sim.readState().state);
      }
    }
    return sim.readState().state;
  };
  const report = () => {
    sim.e.sim_assist_report(rep);
    return Array.from(new Float64Array(sim.e.memory.buffer, rep, 9));
  };
  return { sim, fly, report, now: () => t };
}

function must(rc, what) {
  if (rc !== SIM_OK && !(what.startsWith('sim_world_') && rc >= 0)) {
    throw new Error(`${what} returned ${rc}`);
  }
}

function tiltDeg(s) {
  const c = 1 - 2 * (s[S.QX] * s[S.QX] + s[S.QY] * s[S.QY]);
  return Math.acos(Math.max(-1, Math.min(1, c))) * RAD;
}

function headingDeg(s) {
  const fx = 1 - 2 * (s[S.QY] * s[S.QY] + s[S.QZ] * s[S.QZ]);
  const fy = 2 * (s[S.QX] * s[S.QY] + s[S.QW] * s[S.QZ]);
  return Math.atan2(fy, fx) * RAD;
}

const fails = [];
function band(name, v, lo, hi, unit) {
  const ok = v >= lo && v <= hi;
  if (!ok) {
    fails.push(`${name} ${v.toFixed(3)} ${unit} outside ${lo} to ${hi}`);
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(42)} ${v.toFixed(3).padStart(9)} ${unit}  (${lo} to ${hi})`);
}

const CENTRE = [0, 0, 0, 0.5];
const CLIMB = [0, 0, 0, 1.0];

async function position(af) {
  console.log(`\n${af.name}, POSITION mode`);
  const r = await rig(af, 1, 0, null);
  let maxRate = 0;
  r.fly(2.0, CLIMB, (s) => { maxRate = Math.max(maxRate, Math.hypot(s[S.P], s[S.Q])); });
  const top = r.fly(3.0, CENTRE);
  const rep0 = r.report();
  let zMin = Infinity;
  let zMax = -Infinity;
  let xy = 0;
  let tiltMax = 0;
  r.fly(5.0, CENTRE, (s) => {
    zMin = Math.min(zMin, s[S.Z]);
    zMax = Math.max(zMax, s[S.Z]);
    xy = Math.max(xy, Math.hypot(s[S.X] - top[S.X], s[S.Y] - top[S.Y]));
    tiltMax = Math.max(tiltMax, tiltDeg(s));
  });
  band('climb at full stick, height after 2 s', top[S.Z], 0.8 * af.assist.vUp, 2.6 * af.assist.vUp, 'm');
  band('hold: height wander over 5 s', zMax - zMin, 0, 0.10, 'm');
  band('hold: horizontal wander over 5 s', xy, 0, 0.10, 'm');
  band('hold: largest lean', tiltMax, 0, 3, 'deg');
  band('hover estimate after the climb (throttle)', rep0[8], 0.15, 0.85, '');
  console.log(`       hover throttle ${rep0[7].toFixed(3)}, configured ${af.assist.hover}`);

  const v = af.assist.speeds[af.assist.defaultSpeed];
  let vMax = 0;
  let lean = 0;
  const start = r.fly(0.004, CENTRE);
  const runEnd = r.fly(4.0, [0, 1, 0, 0.5], (s) => {
    vMax = Math.max(vMax, Math.hypot(s[S.VX], s[S.VY]));
    lean = Math.max(lean, tiltDeg(s));
  });
  band('full forward: top speed / configured', vMax / v, 0.9, 1.08, '');
  band('full forward: largest lean', lean, 0, af.assist.tiltMax + 2, 'deg');
  band('full forward: heading held (yaw drift)', Math.abs(headingDeg(runEnd) - headingDeg(start)), 0, 2, 'deg');
  const ux = runEnd[S.VX] / Math.max(1e-6, Math.hypot(runEnd[S.VX], runEnd[S.VY]));
  const uy = runEnd[S.VY] / Math.max(1e-6, Math.hypot(runEnd[S.VX], runEnd[S.VY]));
  let along = 0;
  let back = 0;
  let settle = null;
  const t0 = r.now();
  r.fly(6.0, CENTRE, (s) => {
    const d = (s[S.X] - runEnd[S.X]) * ux + (s[S.Y] - runEnd[S.Y]) * uy;
    along = Math.max(along, d);
    const vAlong = s[S.VX] * ux + s[S.VY] * uy;
    back = Math.min(back, vAlong);
    if (settle === null && Math.hypot(s[S.VX], s[S.VY]) < 0.05 && r.now() - t0 > 0.2) {
      settle = r.now() - t0;
    }
  });
  const rest = r.fly(0.004, CENTRE);
  const finalAlong = (rest[S.X] - runEnd[S.X]) * ux + (rest[S.Y] - runEnd[S.Y]) * uy;
  band('stop: distance from release', along, 0, 1.5 * v, 'm');
  band('stop: overshoot past the rest point', along - finalAlong, 0, 0.5, 'm');
  band('stop: settled under 5 cm/s', settle ?? 99, 0, 4, 's');
  console.log(`       forward run ${vMax.toFixed(2)} m/s at ${lean.toFixed(1)} deg, stop ${along.toFixed(2)} m, back ${(-back).toFixed(2)} m/s`);

  let yawRate = 0;
  r.fly(2.0, [0, 0, 1, 0.5], (s) => { yawRate = Math.max(yawRate, Math.abs(s[S.R])); });
  r.fly(2.0, CENTRE);
  band('full yaw: rate', yawRate * RAD, 40, 120, 'deg/s');

  let side = 0;
  const sideStart = r.fly(0.004, CENTRE);
  r.fly(3.0, [1, 0, 0, 0.5], (s) => {
    const fx = 1 - 2 * (sideStart[S.QY] ** 2 + sideStart[S.QZ] ** 2);
    const fy = 2 * (sideStart[S.QX] * sideStart[S.QY] + sideStart[S.QW] * sideStart[S.QZ]);
    side = Math.max(side, s[S.VX] * fy - s[S.VY] * fx);
  });
  band('full right roll: rightward speed / configured', side / v, 0.85, 1.08, '');
  r.fly(5.0, CENTRE);
  let landed = null;
  const tl = r.now();
  r.sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 0.5, 0.2);
  r.fly(12.0, [0, 0, 0, 0], () => {
    if (landed === null && r.report()[1] === 0) {
      landed = r.now() - tl;
    }
  });
  band('full down: landed and motors idle', landed ?? 99, 0, 11, 's');
  band('attitude rate during takeoff', maxRate * RAD, 0, 120, 'deg/s');
}

async function atti(af) {
  console.log(`\n${af.name}, ATTI mode`);
  const r = await rig(af, 2, 0, null);
  r.fly(2.0, CLIMB);
  r.fly(2.0, CENTRE);
  let lean = 0;
  r.fly(2.0, [0, 0.5, 0, 0.5], (s) => { lean = Math.max(lean, tiltDeg(s)); });
  const rel = r.fly(0.004, CENTRE);
  const v0 = Math.hypot(rel[S.VX], rel[S.VY]);
  const after = r.fly(3.0, CENTRE);
  const drift = Math.hypot(after[S.X] - rel[S.X], after[S.Y] - rel[S.Y]);
  band('half stick: lean / half tilt max', lean / (af.assist.tiltMax / 2), 0.8, 1.2, '');
  band('released: still carrying (drift in 3 s)', drift, 0.5, 100, 'm');
  console.log(`       ${v0.toFixed(2)} m/s at release, ${drift.toFixed(2)} m of drift: ATTI does not brake, which is the point`);
}

async function wall(af, guard) {
  console.log(`\n${af.name}, wall 4 m ahead, virtual cage ${guard > 0 ? `${guard} m` : 'off'}`);
  /* A wall across +x, 4 m from the hull's nose, from the floor to 10 m. */
  const x0 = 4 + af.dims.hullHx;
  const r = await rig(af, 1, guard, [[x0, -10, -5, x0 + 0.5, 10, 10]]);
  r.fly(1.5, CLIMB);
  r.fly(2.0, CENTRE);
  let near = Infinity;
  let maxRate = 0;
  let vAway = 0;
  let tilt = 0;
  let zMin = Infinity;
  r.fly(8.0, [0, 1, 0, 0.5], (s) => {
    near = Math.min(near, x0 - s[S.X] - af.dims.hullHx);
    maxRate = Math.max(maxRate, Math.hypot(s[S.P], s[S.Q], s[S.R]));
    vAway = Math.min(vAway, s[S.VX]);
    tilt = Math.max(tilt, tiltDeg(s));
    zMin = Math.min(zMin, s[S.Z]);
  });
  const held = r.fly(3.0, CENTRE);
  const rep = r.report();
  if (guard > 0) {
    band('closest the hull came to the wall', near, 0.6 * guard, guard + 0.2, 'm');
    band('cage reported the surface', rep[4], 0, guard + 1, 'm');
  } else {
    /*
     * Touching is the caged aircraft's design and a pilot error on the
     * uncaged one, so the bands differ. Either way it must come off the
     * wall flying. The caged one must also not be thrown about by it:
     * a lean past 35 degrees in a 1 m/s tap is a cage that is not doing
     * its job. The uncaged one leaning on a wall for eight seconds is
     * not something this check grades beyond still being in the air.
     */
    band('hull reached the wall', near, -0.05, 0.05, 'm');
    band('still flying after contact', rep[1], 1, 1, '');
    if (af.assist.guard === 0) {
      band('largest lean through the contact', tilt, 0, 35, 'deg');
      band('height kept through the contact', held[S.Z], 1.0, 6, 'm');
    }
  }
  console.log(`       held at ${held[S.Z].toFixed(2)} m after release, closest ${near.toFixed(3)} m, largest rate ${(maxRate * RAD).toFixed(0)} deg/s, lean ${tilt.toFixed(1)} deg, lowest ${zMin.toFixed(2)} m, rebound ${(-vAway).toFixed(2)} m/s`);
}

for (const id of ['caged', 'tethered']) {
  const af = airframeById(id);
  if (af.id !== id) {
    throw new Error(`configs/airframes.js has no ${id}`);
  }
  /* The autopilot turns a lean into a stick through the tune's angle_limit,
   * so the number in configs/airframes.js and the one in the diff are the
   * same number twice, and this is where they are held together. */
  const diff = await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
  const m = diff.match(/^set angle_limit = (\d+)$/m);
  console.log(`\n${af.name}, tune`);
  band('angle_limit in the diff minus assist.angleLimit', (m ? Number(m[1]) : NaN) - af.assist.angleLimit, 0, 0, 'deg');
  await position(af);
  await atti(af);
  await wall(af, af.assist.guard);
  if (af.assist.guard > 0) {
    await wall(af, 0);
  }
}

console.log(fails.length ? `\ninspection-check: ${fails.length} failed\n  ${fails.join('\n  ')}` : '\ninspection-check: all passed');
process.exitCode = fails.length ? 1 : 0;
