/*
 * tether-check.js: the tethered aircraft's cable (src/native/tether.c),
 * flown headless through dist/sim.wasm.
 *
 * What a pilot of this class would call broken, measured:
 *
 *   hover        on the autopilot with the cable hanging from it, the
 *                aircraft holds its height and place, and the cable carries
 *                the weight of the part that hangs
 *   length       flown away from the station at full stick, it stops at the
 *                cable's length and is held there; the cable is never longer
 *                than it is
 *   snag         flown round a column, the cable wraps it and holds the
 *                aircraft short of where a straight cable would let it go
 *   floor        no point of the cable is ever under the floor
 *   only         sim_set_tether is refused for any other airframe, and an
 *                aircraft with the cable off steps exactly as before (the
 *                plant goldens hold that to the bit)
 *   twice        two identical runs give identical cables, to the bit
 *
 * Usage, from the simulator root:  node scripts/tether-check.js
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK, SIM_ERR_BAD_STATE } from '../tests/lib/simmod.js';
import { airframeById } from '../configs/airframes.js';
import { ratesDiff } from '../configs/rates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = await readFile(join(root, 'dist/sim.wasm'));
const S = { X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6 };
/* sim_abi.h. */
const SEGS = 40;
const DOUBLES = 3 * (SEGS + 1) + 3;
/* The tethered airframe's hull_hz_down: the floor under a parked aircraft. */
const FLOOR = -0.12;

const fails = [];
function band(name, v, lo, hi, unit) {
  const ok = v >= lo && v <= hi;
  if (!ok) {
    fails.push(`${name} ${v.toFixed(3)} ${unit} outside ${lo} to ${hi}`);
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(46)} ${v.toFixed(3).padStart(9)} ${unit}  (${lo} to ${hi})`);
}
function must(rc, what) {
  if (rc !== SIM_OK && !(what.startsWith('sim_world_') && rc >= 0)) {
    throw new Error(`${what} returned ${rc}`);
  }
}

async function rig(id, { anchor, length, world }) {
  const af = airframeById(id);
  const sim = await loadSim(wasm);
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  const tune = await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
  must(sim.init(tune + ratesDiff(af.rates)), 'sim_init');
  sim.setCellVoltage(af.packVoltages[0]);
  const a = af.assist;
  if (a) {
    must(sim.e.sim_set_assist(1, a.speeds[a.defaultSpeed], a.vUp, a.vDown, a.tiltMax, a.angleLimit, a.hover),
      'sim_set_assist');
    must(sim.e.sim_set_assist_guard(0), 'sim_set_assist_guard');
  }
  if (world) {
    must(sim.e.sim_world_clear(), 'sim_world_clear');
    must(sim.e.sim_world_frame(0, 0, 0, 0), 'sim_world_frame');
    for (const c of world) {
      const i = sim.e.sim_world_capsule(...c, 0.15, 0.42);
      if (i < 0) {
        throw new Error(`sim_world_capsule returned ${i}`);
      }
    }
    must(sim.e.sim_world_build(), 'sim_world_build');
  }
  const out = sim.e.malloc(DOUBLES * 8);
  let rc = null;
  if (anchor) {
    rc = sim.e.sim_set_tether(1, anchor[0], anchor[1], anchor[2], length);
  }
  let t = 0;
  const cable = () => {
    const n = sim.e.sim_tether_state(out);
    const d = new Float64Array(sim.e.memory.buffer, out, DOUBLES);
    return n > 0 ? Array.from(d) : null;
  };
  const fly = (secs, sticks, each) => {
    const n = Math.round(secs * 250);
    for (let k = 0; k < n; k += 1) {
      t += 0.004;
      sim.input(t, sticks[0], sticks[1], sticks[2], sticks[3]);
      for (let j = 0; j < 4; j += 1) {
        must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, FLOOR, 1.4, 0), 'sim_set_ground');
        sim.step(1);
      }
      if (each) {
        each(sim.readState().state, cable());
      }
    }
    return sim.readState().state;
  };
  return { sim, fly, cable, rc };
}

/* The cable's own measures: its length along the points, its lowest point,
 * and the attach point's distance from the anchor. */
function measure(c) {
  let path = 0;
  let low = Infinity;
  for (let i = 0; i <= SEGS; i += 1) {
    low = Math.min(low, c[3 * i + 2]);
    if (i > 0) {
      path += Math.hypot(c[3 * i] - c[3 * i - 3], c[3 * i + 1] - c[3 * i - 2], c[3 * i + 2] - c[3 * i - 1]);
    }
  }
  const e = 3 * SEGS;
  const straight = Math.hypot(c[e] - c[0], c[e + 1] - c[1], c[e + 2] - c[2]);
  const n = 3 * (SEGS + 1);
  return { path, low, straight, tension: c[n], touching: c[n + 1], laid: c[n + 2] };
}

const CENTRE = [0, 0, 0, 0.5];
const CLIMB = [0, 0, 0, 1.0];
const FORWARD = [0, -1, 0, 0.5];

console.log('\nThe cable is refused for every other airframe');
for (const id of ['5inch', 'caged']) {
  const r = await rig(id, { anchor: [0, 0, FLOOR], length: 20 });
  const ok = r.rc === SIM_ERR_BAD_STATE;
  if (!ok) {
    fails.push(`sim_set_tether on ${id} returned ${r.rc}`);
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} sim_set_tether on ${id} is refused`);
}

console.log('\nHover on the cable: anchor 2 m behind on the floor, 25 m laid');
{
  const r = await rig('tethered', { anchor: [-2, 0, FLOOR + 0.02], length: 25 });
  let low = Infinity;
  let longest = 0;
  r.fly(2.5, CLIMB, (s, c) => {
    const m = measure(c);
    low = Math.min(low, m.low);
    longest = Math.max(longest, m.path);
  });
  const top = r.fly(3.0, CENTRE);
  let zMin = Infinity;
  let zMax = -Infinity;
  let xy = 0;
  let tension = 0;
  let k = 0;
  r.fly(6.0, CENTRE, (s, c) => {
    const m = measure(c);
    low = Math.min(low, m.low);
    longest = Math.max(longest, m.path);
    zMin = Math.min(zMin, s[S.Z]);
    zMax = Math.max(zMax, s[S.Z]);
    xy = Math.max(xy, Math.hypot(s[S.X] - top[S.X], s[S.Y] - top[S.Y]));
    tension += m.tension;
    k += 1;
  });
  band('height after the climb', top[S.Z], 1.0, 3.5, 'm');
  band('hold on the cable: height wander over 6 s', zMax - zMin, 0, 0.15, 'm');
  band('hold on the cable: horizontal wander over 6 s', xy, 0, 0.25, 'm');
  /* The hanging part weighs about 25 g a metre times the height and a bit:
   * a few tenths of a newton, not nothing and not the aircraft's weight. */
  band('mean tension at the aircraft in the hover', tension / k, 0.05, 3.0, 'N');
  band('cable along its points, at its longest', longest, 0, 25 * 1.02, 'm');
  band('lowest point of the cable over the floor', low - FLOOR, -0.001, 99, 'm');
}

console.log('\nLength: 6 m laid, flown away at full stick for 12 s');
{
  const r = await rig('tethered', { anchor: [0, 0, FLOOR + 0.02], length: 6 });
  r.fly(2.5, CLIMB);
  r.fly(1.0, CENTRE);
  let far = 0;
  let longest = 0;
  let last = null;
  r.fly(12.0, FORWARD, (s, c) => {
    const m = measure(c);
    far = Math.max(far, m.straight);
    longest = Math.max(longest, m.path);
    last = s;
  });
  const speed = Math.hypot(last[S.VX], last[S.VY]);
  band('furthest the aircraft got from the anchor', far, 4.5, 6 * 1.02, 'm');
  band('cable along its points, at its longest', longest, 0, 6 * 1.02, 'm');
  band('ground speed at the end, held by the cable', speed, 0, 0.25, 'm/s');
}

console.log('\nSnag: 6 m laid, a column between, the cable swept across it');
{
  /*
   * The anchor on the floor 3 m behind a 0.3 m column. The aircraft starts
   * a metre past the column and to its left, climbs, then flies right: its
   * hanging cable sweeps across the column and catches on the far side of
   * it. Flying on to the right, the cable now runs anchor, round the
   * column, aircraft, so the aircraft is held about 4.8 m from the anchor.
   * A straight 6 m cable would let it reach 6 m.
   */
  const col = [[0, 0, FLOOR - 1, 0, 0, FLOOR + 6, 0.3]];
  const r = await rig('tethered', { anchor: [-3, 0, FLOOR + 0.02], length: 6, world: col });
  must(r.sim.e.sim_set_pose(1.0, 1.2, 0, 1, 0, 0, 0), 'sim_set_pose');
  r.fly(2.0, CLIMB);
  r.fly(1.0, CENTRE);
  let far = 0;
  let touchMax = 0;
  let last = null;
  let longest = 0;
  r.fly(14.0, [1, 0, 0, 0.5], (s, c) => {
    const m = measure(c);
    far = Math.max(far, m.straight);
    touchMax = Math.max(touchMax, m.touching);
    longest = Math.max(longest, m.path);
    last = s;
  });
  const speed = Math.hypot(last[S.VX], last[S.VY]);
  console.log(`       aircraft ended at x ${last[S.X].toFixed(2)} y ${last[S.Y].toFixed(2)} z ${last[S.Z].toFixed(2)}`);
  band('points of the cable on the column or floor', touchMax, 1, SEGS, '');
  band('straight distance anchor to aircraft, held', far, 3.5, 5.5, 'm');
  band('cable along its points, at its longest', longest, 0, 6 * 1.02, 'm');
  band('ground speed at the end, held by the snag', speed, 0, 0.3, 'm/s');
}

console.log('\nTwice: two identical runs');
{
  const hashes = [];
  for (let run = 0; run < 2; run += 1) {
    const r = await rig('tethered', { anchor: [-2, 0, FLOOR + 0.02], length: 15 });
    const h = createHash('sha256');
    r.fly(2.0, CLIMB, (s, c) => {
      h.update(Buffer.from(new Float64Array(c).buffer));
      h.update(Buffer.from(s.buffer.slice(0)));
    });
    r.fly(3.0, FORWARD, (s, c) => h.update(Buffer.from(new Float64Array(c).buffer)));
    hashes.push(h.digest('hex'));
  }
  const ok = hashes[0] === hashes[1];
  if (!ok) {
    fails.push('two identical tether runs differ');
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} identical, ${hashes[0].slice(0, 16)}`);
}

if (fails.length) {
  console.log(`\ntether-check: ${fails.length} FAILED`);
  for (const f of fails) {
    console.log(`  ${f}`);
  }
  process.exit(1);
}
console.log('\ntether-check: all passed');
