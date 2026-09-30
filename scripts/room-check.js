/*
 * room-check.js: a living room's furniture, flown in the plant.
 *
 * The whoop builder offers a table, a chair and a banner. Each is a short list
 * of axis aligned boxes (src/props/room.js), and the claim that goes with
 * that is that the physics needs NO change to hold them: no new shape in the
 * module's ABI, no change to src/native, no change to the build. src/native/
 * world.c takes a static solid as sim_world_box or sim_world_capsule, and a
 * table is five of the first.
 *
 * A claim about the physics is checked in the physics. This flies the real
 * module (dist/sim.wasm, the baseline config, the plant a whoop is flown on)
 * through each piece as src/render/scene.js builds it in a RaceGOW room: the
 * document read by courseFromDocument, so every size is the room's scale, the
 * boxes placed and turned by roomSolids, put into the same Colliders and
 * uploaded by the same uploadWorld the shell uses. Then a stick script flies
 * the craft along a path, the way scripts/world-check.js flies a wall:
 *
 *   under a table between its legs, and over it      clear: not one step in contact
 *   into a leg, and into the edge of the top         touches, and the box it touches is that one
 *   under a chair's seat                             clear
 *   into a chair's back, and its seat                touches that box, and the back is behind it
 *   into a banner's panel, over it, round its end    touches, clear, clear
 *
 * A HOOP AND A HEX GATE are the same claim from the other side, a frame that is
 * a run of capsules on a shape instead of four bars, and a hole that is not a
 * rectangle. Their tubes are made by src/props/aperture.js's frameParts, the
 * one function the game builds them from, put into the same Colliders by the
 * transform src/render/scene.js places every gate with, and the same flights
 * are scored by the real Race on the trace the plant flew:
 *
 *   through the middle, and near the edge of the hole     clear, and it scores
 *   through the low part of a hoop on the floor           clear (the floor is the sill), scores
 *   through the corner of the box that holds it           clear of every tube, and does not score
 *   into a tube                                           touches
 *
 * Every flight is flown twice and must agree with itself to the bit, which is
 * the determinism CLAUDE.md asks of everything on the physics path. Nothing
 * here reaches the module through JS trigonometry: the frames are the quarter
 * turns of src/props/trig.js and the sticks are + - * / and square roots.
 *
 * Usage: node scripts/room-check.js [--verbose] [--wasm=PATH]
 * Exit code is the number of checks that failed.
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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flyRun, frameAt, pathSticks, toThree } from './lib/worldruns.js';
import { uploadWorld, setWorldFrame } from '../src/game/plantworld.js';
import { Colliders, GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { addSolids } from '../src/props/solids.js';
import { roomSolids } from '../src/props/room.js';
import { frameParts, insideShape } from '../src/props/aperture.js';
import { Race } from '../src/game/race.js';
import { PIPE_OD } from '../src/trackbuilder/racegow.js';
import { threePosToSim } from '../src/render/frame.js';
import { createTrack } from '../src/trackbuilder/model.js';
import { placeOnTrack } from '../src/trackbuilder/snap.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { MICRO_SCALE } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const wasmArg = (args.find((a) => a.startsWith('--wasm=')) || '').split('=')[1] || '';

/* The plant a whoop is flown on is the baseline one (simIdFor in
 * configs/airframes.js is 0 for both airframes), in a room built MICRO_SCALE
 * times life size. */
const AIRFRAME = 0;
const HULL = 0.094;
const SETTLE_MS = 500;
const PUSH_MS = 500;
const AFTER_MS = 500;
const SECS = 4.5;
const SPEED = 3.5;
const V3 = () => ({ x: 0, y: 0, z: 0 });

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

/* One piece of furniture as the room builds it: the document, read into a
 * course, its solids, and the colliders they go into. */
function pieceWorld(type, yaw) {
  const doc = createTrack('room-check', 'micro');
  const el = placeOnTrack(doc, type, { x: 5, y: 6 });
  el.yaw = yaw;
  const course = courseFromDocument(doc);
  const s = course.structures.find((x) => x.id === el.id);
  const solids = roomSolids(type, s.dims, s.x, s.baseY, s.z, s.yaw);
  const colliders = new Colliders();
  addSolids(colliders, solids);
  colliders.build();
  return { s, solids, colliders, boxes: solids.map((o) => o.box) };
}

/*
 * A hoop or a hex gate as the room builds it: the document read into a course, the frame's capsules from
 * frameParts, and the same transform scene.js places every gate with (its position, and the heading of the
 * first station, with the plain cosine and sine it uses). Returns what a flight needs and what the race is
 * handed, which is what scene.js hands it: the position, the heading and the measured aperture.
 */
function shapedWorld(type, sillH = 0) {
  const doc = createTrack('room-check', 'micro');
  const el = placeOnTrack(doc, type, { x: 5, y: 6 });
  if (sillH) {
    el.dims.sillH = sillH;
  }
  const course = courseFromDocument(doc);
  const s = course.structures.find((x) => x.id === el.id);
  const st = course.stations[0];
  const tubeR = (PIPE_OD * MICRO_SCALE) / 2;
  const parts = frameParts(s.shape, s.dims.clearW / 2, s.dims.clearH / 2, tubeR, s.dims.sillH, st.pitch, false);
  const yaw = st.yaw;
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const y = s.baseY;
  const colliders = new Colliders();
  for (const c of parts.caps) {
    colliders.add(
      c.kind,
      s.x + c.ax * cs + c.az * sn, y + c.ay, s.z - c.ax * sn + c.az * cs,
      s.x + c.bx * cs + c.bz * sn, y + c.by, s.z - c.bx * sn + c.bz * cs,
      c.r,
    );
  }
  colliders.build();
  const aperture = {
    shape: s.shape, index: 0, sillH: s.dims.sillH, centreY: parts.centreY, clearW: s.dims.clearW, clearH: s.dims.clearH,
  };
  const across = [cs, 0, -sn];
  const along = [sn, 0, cs];
  const centre = [s.x, y + parts.centreY, s.z];
  return {
    s, st, parts, colliders, solids: parts.caps, aperture, yaw, tubeR,
    /* A point of the hole's plane, u across and v up, t along the way it is flown. */
    at: (u, v, t) => [centre[0] + across[0] * u + along[0] * t, centre[1] + v, centre[2] + across[2] * u + along[2] * t],
    /* The gate as the race is handed it. */
    gate: { position: { x: s.x, y, z: s.z }, heading: yaw, pitch: st.pitch, flyOrder: 0, virtual: false, apertures: [aperture] },
    halfW: s.dims.clearW / 2,
    halfH: s.dims.clearH / 2,
  };
}

/* How near a straight flight comes to the axis of any tube of the frame, in metres. */
function nearestTube(world, from, to) {
  let best = Infinity;
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  for (const [a, b] of world.parts.tubes) {
    /* World points of the tube's ends, by the same transform. */
    const cs = Math.cos(world.yaw);
    const sn = Math.sin(world.yaw);
    const P = (q) => [world.s.x + q.x * cs + q.z * sn, world.s.baseY + q.y, world.s.z - q.x * sn + q.z * cs];
    const A = P(a);
    const B = P(b);
    /* Closest approach of two segments, sampled finely along the flight and exactly along the tube. */
    for (let i = 0; i <= 400; i += 1) {
      const t = i / 400;
      const px = from[0] + d[0] * t;
      const py = from[1] + d[1] * t;
      const pz = from[2] + d[2] * t;
      const v = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const l2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      const u = Math.max(0, Math.min(1, ((px - A[0]) * v[0] + (py - A[1]) * v[1] + (pz - A[2]) * v[2]) / l2));
      best = Math.min(best, Math.hypot(px - A[0] - v[0] * u, py - A[1] - v[1] * u, pz - A[2] - v[2] * u));
    }
  }
  return best;
}

/*
 * One flight, in Three's axes: from a point to a point along one of the four
 * compass headings, the frame set at the start as townRun sets it (the nose
 * along the plant's +x), the ground at height 0. `heading` is the pilot's:
 * 0 flies along +z and a quarter turn flies along +x.
 */
function flightRun(name, world, from, to, heading) {
  const o3 = threePosToSim(from[0], from[1], from[2], V3());
  const f = frameAt([o3.x, o3.y, o3.z], heading + Math.PI);
  const p = threePosToSim(to[0], to[1], to[2], V3());
  const dx = p.x - o3.x;
  const dy = p.y - o3.y;
  const dz = p.z - o3.z;
  const d = [f.c * dx + f.s * dy, -f.s * dx + f.c * dy, dz];
  const P = { p0: [0, 0, 0], d, secs: SECS, vEnd: SPEED, pushMs: PUSH_MS, settleMs: SETTLE_MS, after: 0.34 };
  const groundZ = -from[1];
  return {
    name,
    airframe: AIRFRAME,
    ms: SETTLE_MS + SECS * 1000 + PUSH_MS + AFTER_MS,
    setup(sim) {
      const n = uploadWorld(sim, world.colliders);
      if (n !== world.solids.length) {
        throw new Error(`uploadWorld took ${n} of ${world.solids.length} solids`);
      }
      setWorldFrame(sim, from[0], from[1], from[2], f.yaw, 0);
      sim.e.sim_set_pose(0, 0, 0, 1, 0, 0, 0);
      sim.e.sim_rest();
    },
    /* Height held, because these are flown under things and a path that lets the
     * craft swell by half a metre on the way is a path that meets the seat. */
    sticks: pathSticks(P, [1, 0], { hold: true }),
    before(sim) {
      sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, groundZ, GROUND_MU, GROUND_E);
    },
    where: (st) => toThree(f, [st[1], st[2], st[3]]),
  };
}

const sameBits = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const wasm = await readFile(wasmArg ? resolve(wasmArg) : join(root, 'dist/sim.wasm'));
  const configs = { [AIRFRAME]: await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8') };
  const env = { wasm, configs };

  /* Fly one run twice. The flights must agree with themselves to the bit. */
  async function fly(run) {
    const a = await flyRun(run, env);
    const b = await flyRun(run, env);
    const same = sameBits(
      [a.endAt, a.contactSteps, a.firstTouchMs, a.firstShape, a.maxZ, a.endSpeed],
      [b.endAt, b.contactSteps, b.firstTouchMs, b.firstShape, b.maxZ, b.endSpeed],
    );
    if (verbose) {
      console.log(`        ${run.name}: ${a.contactSteps} steps in contact, first at ${a.firstTouchMs} ms on shape ${a.firstShape}, ended ${a.endAt.map((v) => v.toFixed(2)).join(', ')}`);
    }
    return { m: a, same };
  }

  const clear = async (name, world, from, to, heading, past) => {
    const { m, same } = await fly(flightRun(name, world, from, to, heading));
    check(`${name}: not one step in contact, and it gets through`,
      m.contactSteps === 0 && m.firstTouchMs < 0 && m.supportsTouched.size === 0 && past(m.endAt),
      `${m.contactSteps} steps, first ${m.firstTouchMs} ms, ended ${m.endAt.map((v) => v.toFixed(2)).join(', ')}`);
    check(`${name}: flown twice it is the same to the bit`, same);
  };
  const hits = async (name, world, from, to, heading, shapes) => {
    const { m, same } = await fly(flightRun(name, world, from, to, heading));
    check(`${name}: it touches, and what it touches is ${shapes.length === 1 ? `box ${shapes[0]}` : `one of boxes ${shapes.join(', ')}`}`,
      m.contactSteps > 0 && shapes.includes(m.firstShape),
      `${m.contactSteps} steps in contact, first shape ${m.firstShape}`);
    check(`${name}: flown twice it is the same to the bit`, same);
  };

  console.log(`room check: dist/sim.wasm, the baseline plant, a room built ${MICRO_SCALE.toFixed(3)} times life size`);

  /* -------- a table -------- */
  {
    console.log('\na table');
    const w = pieceWorld('table', 0);
    const [top, ...legs] = w.boxes;
    const stats = w.colliders.stats();
    check('five solids, every one a box of the wall kind, and no capsule',
      stats.count === 5 && stats.boxes === 5 && stats.capsules === 0 && stats.byKind.wall === 5);
    const xc = (top[0] + top[3]) / 2;
    const underside = legs[0][4];
    const gapAcross = Math.abs(legs[2][0] - legs[0][3]);
    const gapAlong = Math.abs(legs[0][2] - legs[1][5]);
    check('there is room to fly under it: the hull fits between the top and the floor, and between the legs both ways',
      underside > 1.2 + HULL + 0.5 && gapAcross > 4 * HULL && gapAlong > 4 * HULL,
      `underside ${underside.toFixed(2)}, gaps ${gapAcross.toFixed(2)} and ${gapAlong.toFixed(2)}`);
    const y = 1.2;
    await clear('under the top, between the legs', w, [xc, y, top[2] - 8], [xc, y, top[5] + 8], 0, (e) => e[2] > top[5] + 2);
    const leg = w.boxes[1];
    const lx = (leg[0] + leg[3]) / 2;
    await hits('into a leg', w, [lx, y, top[2] - 8], [lx, y, top[5] + 8], 0, [1, 2, 3, 4]);
    const mid = (top[1] + top[4]) / 2;
    await hits('into the edge of the top', w, [xc, mid, top[2] - 8], [xc, mid, top[5] + 8], 0, [0]);
    await clear('over the top', w, [xc, top[4] + 0.9, top[2] - 8], [xc, top[4] + 0.9, top[5] + 8], 0, (e) => e[2] > top[5] + 2);
  }

  /* -------- a table turned a quarter -------- */
  {
    console.log('\na table turned a quarter');
    const w = pieceWorld('table', Math.PI / 2);
    const top = w.boxes[0];
    const zc = (top[2] + top[5]) / 2;
    /* Its long side now runs along the room's z, so the way under it is along x. */
    await clear('under the top, along the way it was turned to', w, [top[0] - 8, 1.2, zc], [top[3] + 8, 1.2, zc], Math.PI / 2, (e) => e[0] > top[3] + 2);
    const zLeg = (w.boxes[1][2] + w.boxes[1][5]) / 2;
    await hits('into a leg', w, [top[0] - 8, 1.2, zLeg], [top[3] + 8, 1.2, zLeg], Math.PI / 2, [1, 2, 3, 4]);
  }

  /* -------- a chair -------- */
  {
    console.log('\na chair');
    const w = pieceWorld('chair', 0);
    const [seat, , , , , back] = w.boxes;
    const stats = w.colliders.stats();
    check('six solids, every one a box of the wall kind', stats.count === 6 && stats.boxes === 6 && stats.byKind.wall === 6);
    const xc = (seat[0] + seat[3]) / 2;
    const zc = (seat[2] + seat[5]) / 2;
    await clear('under the seat, between the legs', w, [xc, 0.75, seat[2] - 8], [xc, 0.75, seat[5] + 8], 0, (e) => e[2] > seat[5] + 2);
    const yBack = (back[1] + back[4]) / 2;
    await hits('into the back, from behind', w, [seat[0] - 8, yBack, zc], [seat[3] + 8, yBack, zc], Math.PI / 2, [5]);
    /* Which side the back is on, which a chair that faces the wrong way gets wrong:
     * the chair faces +x, so from the middle of the seat the back is behind, on the
     * way to -x, and there is nothing in front of it on the way to +x. */
    await hits('into the back from the seat, flying the way the chair does not face', w, [xc, yBack, zc], [seat[0] - 8, yBack, zc], -Math.PI / 2, [5]);
    await clear('out over the seat the way the chair faces', w, [xc, yBack, zc], [seat[3] + 8, yBack, zc], Math.PI / 2, (e) => e[0] > seat[3] + 2);
    const ySeat = (seat[1] + seat[4]) / 2;
    await hits('into the side of the seat', w, [xc, ySeat, seat[2] - 8], [xc, ySeat, seat[5] + 8], 0, [0]);
  }

  /* -------- a banner -------- */
  {
    console.log('\na banner');
    const w = pieceWorld('banner', 0);
    const [panel] = w.boxes;
    const stats = w.colliders.stats();
    check('three solids, every one a box of the wall kind', stats.count === 3 && stats.boxes === 3 && stats.byKind.wall === 3);
    const xc = (panel[0] + panel[3]) / 2;
    await hits('into the panel', w, [xc, 2.0, panel[2] - 8], [xc, 2.0, panel[5] + 8], 0, [0]);
    await clear('over the panel', w, [xc, panel[4] + 0.9, panel[2] - 8], [xc, panel[4] + 0.9, panel[5] + 8], 0, (e) => e[2] > panel[5] + 2);
    const xEnd = panel[3] + 1.5;
    await clear('round the end of it', w, [xEnd, 2.0, panel[2] - 8], [xEnd, 2.0, panel[5] + 8], 0, (e) => e[2] > panel[5] + 2);
  }

  /* -------- a hoop and a hex gate -------- */
  for (const type of ['hoop', 'hexGate']) {
    console.log(`\na ${type === 'hoop' ? 'hoop' : 'hex gate'}`);
    const w = shapedWorld(type);
    const stats = w.colliders.stats();
    const want = type === 'hoop' ? 22 : 5;
    check(`${want} solids, every one a capsule of the gate kind: the tubes that are above the floor, and nothing else`,
      stats.count === want && stats.capsules === want && stats.boxes === 0 && stats.byKind.gate === want, JSON.stringify(stats));
    check('the frame the scene builds and the frame flown here are the same: frameParts, with the scene\'s tube and the course\'s size',
      w.parts.tubes.length === want && Math.abs(w.aperture.clearW - 0.711 * MICRO_SCALE) < 0.02, `${w.aperture.clearW}`);

    const scored = async (name, u, v, wantScore, wantClear) => {
      const from = w.at(u, v, -8);
      const to = w.at(u, v, 8);
      const run = flightRun(name, w, from, to, w.yaw);
      const trace = [];
      run.plan = (st) => {
        trace.push(run.where(st));
        return 0;
      };
      const { m, same } = await fly(run);
      const race = new Race([w.gate], 'micro');
      for (let i = 1; i < trace.length; i += 1) {
        const a = trace[i - 1];
        const b = trace[i];
        race.update({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }, i, i);
      }
      const did = race.lapStartMs != null;
      const near = nearestTube(w, from, to);
      if (wantClear) {
        check(`${name}: the line stays ${(near - w.tubeR).toFixed(2)} m clear of every tube, the craft's hull is ${HULL} m, and it is not in contact once`,
          near > w.tubeR + HULL + 0.03 && m.contactSteps === 0 && m.firstTouchMs < 0, `${near.toFixed(3)} m to the nearest tube axis, ${m.contactSteps} steps in contact`);
        check(`${name}: the race ${wantScore ? 'scores it' : 'does not score it'}`, did === wantScore, `scored: ${did}`);
      }
      check(`${name}: flown twice it is the same to the bit`, same);
      return { m, did, near };
    };
    await scored('through the middle', 0, 0, true, true);
    await scored('near the edge of the hole, three fifths of the way out', 0.6 * w.halfW, 0, true, true);
    await scored('across the low part, a little above the floor', 0, -w.halfH + 0.35, true, true);
    /* A point outside the shape and inside the box: for a ring the corner, for a hexagon between the point and the flat. */
    const u = type === 'hoop' ? 0.9 * w.halfW : 0.85 * w.halfW;
    const v = type === 'hoop' ? 0.9 * w.halfH : 0.75 * w.halfH;
    check(`the point (${(u / w.halfW).toFixed(2)}, ${(v / w.halfH).toFixed(2)}) of the box is in the box and is not in the ${type === 'hoop' ? 'ring' : 'hexagon'}`,
      Math.abs(u) <= w.halfW && Math.abs(v) <= w.halfH && !insideShape(w.s.shape, w.halfW, w.halfH, u, v));
    await scored('past the corner of the box that holds it', u, v, false, true);
    /* Into the top of the ring, on the tube. */
    const top = await scored('into the top tube', 0, w.halfH + w.tubeR, false, false);
    check('into the top tube: it touches, and it is a tube of this frame', top.m.contactSteps > 0 && top.m.firstShape >= 0 && top.m.firstShape < want, `${top.m.contactSteps} steps, first shape ${top.m.firstShape}`);
  }
  {
    console.log('\na hoop that hangs in the air');
    const w = shapedWorld('hoop', 0.6);
    const stats = w.colliders.stats();
    check('every tube, the post under the lowest corner, and the stub it stands on', stats.count === 26 && stats.byKind.gate === 25 && stats.byKind.obstacle === 1, JSON.stringify(stats));
    const { m, same } = await fly(flightRun('through the middle of it', w, w.at(0, 0, -8), w.at(0, 0, 8), w.yaw));
    check('through the middle of it: not one step in contact', m.contactSteps === 0 && m.firstTouchMs < 0, `${m.contactSteps} steps`);
    check('through the middle of it: flown twice it is the same to the bit', same);
    const post = await fly(flightRun('into the post', w, w.at(0, -w.halfH - 0.3, -8), w.at(0, -w.halfH - 0.3, 8), w.yaw));
    check('into the post under it: it touches', post.m.contactSteps > 0, `${post.m.contactSteps} steps`);
    check('into the post under it: flown twice it is the same to the bit', post.same);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
