/*
 * autoscale-selftest.js: the GPU guard (src/render/gpugate.js) and Auto
 * graphics (src/render/autoscale.js) driven in plain Node with synthetic
 * frames and a fake WebGL, one assertion per way they have been found wrong.
 *
 * WHY A SELFTEST AND NOT A PROBE. Both modules decide from TIMING, and the
 * only GPU this project's checks can reach is SwiftShader, which is every
 * machine's worst case at once: a probe there can show that Auto walks
 * down, never that it leaves a healthy 40 Hz handheld alone or that a
 * frozen tab does not poison the guard. Both modules take the clock from
 * their caller and allocate nothing of their own, so they can be fed any
 * machine at all, frame by frame, in milliseconds of wall time.
 *
 * The cases come from the review of 2026-09-27
 * (prompts/input-lag-review-2026-09-27.md): each names its finding.
 *
 * The same two rules as scripts/input-selftest.js: a check is written
 * against a case the code got wrong, not one its arithmetic happens to
 * satisfy, and a latch is driven there and back.
 *
 * Usage:
 *   npm run autoscale:selftest
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { createGpuGate } from '../src/render/gpugate.js';
import { AUTO_FLOOR, createAutoScale } from '../src/render/autoscale.js';

let passed = 0;
let failed = 0;
const fails = [];

function check(what, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${what}`);
    return;
  }
  failed += 1;
  fails.push(`${what}${detail ? `, ${detail}` : ''}`);
  console.log(`  FAIL  ${what}${detail ? `, ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------------
 * A GPU with a clock. A fence is signalled once the fake clock passes the
 * moment the fake GPU finishes the frame it follows, which the rig decides.
 * The constants are WebGL2's.
 * ---------------------------------------------------------------------- */

function fakeGpu() {
  const clock = { now: 0 };
  let lost = false;
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    SYNC_STATUS: 0x9114,
    SIGNALED: 0x9119,
    UNSIGNALED: 0x9118,
    /* When the frame being fenced will be done. Set by the rig before each
     * submitted(). */
    nextDoneAt: 0,
    live: 0,
    fenceSync() {
      gl.live += 1;
      return { doneAt: gl.nextDoneAt };
    },
    getSyncParameter(f) {
      if (lost) {
        throw new Error('context lost');
      }
      return clock.now >= f.doneAt ? gl.SIGNALED : gl.UNSIGNALED;
    },
    deleteSync() {
      gl.live -= 1;
    },
  };
  return { gl, clock, lose() { lost = true; }, restore() { lost = false; } };
}

/*
 * Frames at a fixed interval, each taking `gpuMs` of GPU after its draw,
 * the GPU working through them in order (a queue), polled every `pollMs` as
 * the sticks' timer does. Returns the draws the guard held.
 */
function runFrames(gate, rig, { frames, intervalMs, gpuMs, pollMs = 4, drawMs = 1 }) {
  const { gl, clock } = rig;
  let gpuFree = clock.now;
  let held = 0;
  let heldTwice = 0;
  let lastHeld = false;
  for (let i = 0; i < frames; i += 1) {
    const frameAt = clock.now;
    const skip = gate.shouldSkip(frameAt, true);
    if (skip) {
      held += 1;
      if (lastHeld) {
        heldTwice += 1;
      }
    } else {
      clock.now = frameAt + drawMs;
      const start = gpuFree > clock.now ? gpuFree : clock.now;
      gpuFree = start + gpuMs;
      gl.nextDoneAt = gpuFree;
      gate.submitted(clock.now);
    }
    lastHeld = skip;
    const next = frameAt + intervalMs;
    for (let t = clock.now + pollMs; t < next; t += pollMs) {
      clock.now = t;
      gate.poll(t);
    }
    clock.now = next;
  }
  return { held, heldTwice };
}

/* ------------------------------------------------------------------------ */

section('the GPU guard: what it times, and when it holds a draw back');
{
  const rig = fakeGpu();
  const gate = createGpuGate(rig.gl);
  const r = runFrames(gate, rig, { frames: 240, intervalMs: 1000 / 60, gpuMs: 3 });
  check('a GPU with room to spare is timed near its real cost, polled every 4 ms',
    gate.state.samples > 200 && gate.state.gpuMs > 3 && gate.state.gpuMs < 3 + 4 + 0.001,
    `${gate.state.gpuMs.toFixed(2)} ms over ${gate.state.samples} samples`);
  check('and never has a draw held back', r.held === 0, `${r.held} held`);
  check('every fence it made is deleted once seen', rig.gl.live <= 1, `${rig.gl.live} still live`);
}
{
  const rig = fakeGpu();
  const gate = createGpuGate(rig.gl);
  const r = runFrames(gate, rig, { frames: 240, intervalMs: 1000 / 60, gpuMs: 22 });
  check('a GPU that cannot hold sixty has draws held back', r.held > 40, `${r.held} of 240 held`);
  check('never two in a row', r.heldTwice === 0, `${r.heldTwice} times`);
}

section('F3: time that was not GPU time does not reach the average');
{
  const rig = fakeGpu();
  const gate = createGpuGate(rig.gl);
  runFrames(gate, rig, { frames: 120, intervalMs: 1000 / 60, gpuMs: 5 });
  const before = gate.state.gpuMs;
  const samples = gate.state.samples;
  /* A draw goes in, and the page freezes with its fence pending: a hidden
   * tab, a frozen one, a context lost and restored. Three seconds later the
   * fence reads signalled, as the probe of 2026-09-27 saw it. */
  rig.gl.nextDoneAt = rig.clock.now + 5;
  gate.submitted(rig.clock.now);
  rig.clock.now += 3000;
  gate.poll(rig.clock.now);
  check('a fence pending through a three second freeze leaves the average alone',
    Math.abs(gate.state.gpuMs - before) < 1e-9,
    `${before.toFixed(2)} ms became ${gate.state.gpuMs.toFixed(2)} ms`);
  check('and is not counted as a sample', gate.state.samples === samples,
    `${samples} became ${gate.state.samples}`);
  check('nor left pending to hold the next draw', !gate.shouldSkip(rig.clock.now, true));
}
{
  const rig = fakeGpu();
  const gate = createGpuGate(rig.gl);
  runFrames(gate, rig, { frames: 120, intervalMs: 1000 / 60, gpuMs: 5 });
  const before = gate.state.gpuMs;
  /* Four draws go in and the page stalls: the ring fills with fences a
   * freeze old. The one a new draw overwrites used to be timed as at least
   * that old. */
  for (let i = 0; i < 4; i += 1) {
    rig.gl.nextDoneAt = rig.clock.now + 5;
    gate.submitted(rig.clock.now);
  }
  rig.clock.now += 3000;
  rig.gl.nextDoneAt = rig.clock.now + 5;
  gate.submitted(rig.clock.now);
  check('a fence a freeze old, pushed out of the ring by a new draw, is not timed either',
    Math.abs(gate.state.gpuMs - before) < 1e-9,
    `${before.toFixed(2)} ms became ${gate.state.gpuMs.toFixed(2)} ms`);
}
{
  const rig = fakeGpu();
  const gate = createGpuGate(rig.gl);
  runFrames(gate, rig, { frames: 120, intervalMs: 1000 / 60, gpuMs: 22 });
  const samples = gate.state.samples;
  rig.gl.nextDoneAt = rig.clock.now + 22;
  gate.submitted(rig.clock.now);
  gate.reset();
  check('reset drops a pending fence, so the next draw is not held for it',
    !gate.shouldSkip(rig.clock.now + 1, true));
  rig.clock.now += 40;
  gate.poll(rig.clock.now);
  check('and the dropped fence is never timed', gate.state.samples === samples,
    `${samples} became ${gate.state.samples}`);
  check('and deleted, not leaked', rig.gl.live === 0, `${rig.gl.live} still live`);
  check('reset keeps the average: it is still this GPU on this world',
    gate.state.gpuMs > 14, `${gate.state.gpuMs.toFixed(2)} ms`);
  gate.reset(true);
  check('a new world forgets the average, so a heavy world\'s saturation does not hold a light one\'s draws',
    gate.state.samples === 0 && !gate.shouldSkip(rig.clock.now, true),
    `${gate.state.samples} samples, ${gate.state.gpuMs.toFixed(2)} ms`);
}
{
  const rig = fakeGpu();
  const gate = createGpuGate(rig.gl);
  runFrames(gate, rig, { frames: 60, intervalMs: 1000 / 60, gpuMs: 5 });
  rig.gl.nextDoneAt = rig.clock.now + 5;
  gate.submitted(rig.clock.now);
  rig.lose();
  let threw = false;
  try {
    rig.clock.now += 10;
    gate.poll(rig.clock.now);
    gate.shouldSkip(rig.clock.now, true);
  } catch (e) {
    threw = true;
  }
  check('a lost context does not throw out of the frame loop', !threw);
}

/* ------------------------------------------------------------------------
 * Auto, as main.js drives it: observe every frame, and when the controller
 * asks for a new scale, apply it and say so. `gpuMs` is what the gate would
 * report (the gate is not run here, its state is), `drawMs` the page's own
 * render time. Returns the scales it moved through.
 * ---------------------------------------------------------------------- */

function driveAuto(auto, ms, { dt, gpuMs = null, renderMs = 4, blockMs = 6 }) {
  const gate = gpuMs == null ? null : { on: true, samples: 100, gpuMs };
  const moves = [];
  for (let t = 0; t < ms; t += dt) {
    auto.observe(dt, renderMs, blockMs, gate, true);
    if (auto.state.dirty) {
      auto.applied(auto.state.want);
      moves.push(Math.round(auto.state.scale * 100) / 100);
    }
  }
  return moves;
}

section('F4: Auto\'s preset evidence says what is true now, not what once was');
{
  const auto = createAutoScale();
  auto.setFloor(AUTO_FLOOR);
  /* A GPU that cannot hold sixty: down to the floor, and three seconds more. */
  driveAuto(auto, 15000, { dt: 1000 / 60, gpuMs: 22 });
  check('a GPU over budget at the floor for three seconds asks for a lower preset',
    auto.state.scale <= AUTO_FLOOR + 0.001 && auto.state.demote,
    `scale ${auto.state.scale.toFixed(2)}, demote ${auto.state.demote}`);
  /* Then the world gets light: a quieter part of the map, a smaller window. */
  const moves = driveAuto(auto, 20000, { dt: 1000 / 60, gpuMs: 4 });
  check('the scale climbs back when there is room', moves.length > 0 && auto.state.scale > AUTO_FLOOR + 0.001,
    `moves ${moves.join(', ')}`);
  check('and once it is off the floor the ask for a lower preset is withdrawn', !auto.state.demote,
    `demote ${auto.state.demote} at scale ${auto.state.scale.toFixed(2)}`);
}
{
  const auto = createAutoScale();
  auto.setFloor(AUTO_FLOOR);
  driveAuto(auto, 46000, { dt: 1000 / 60, gpuMs: 4 });
  check('forty five seconds of a quiet GPU at full scale asks for a higher preset',
    auto.state.scale >= 0.999 && auto.state.promote, `promote ${auto.state.promote}`);
  const moves = driveAuto(auto, 2000, { dt: 1000 / 60, gpuMs: 22 });
  check('a load arrives and the scale comes down', moves.length > 0, `moves ${moves.join(', ')}`);
  check('and the ask for a higher preset is withdrawn with it', !auto.state.promote,
    `promote ${auto.state.promote} at scale ${auto.state.scale.toFixed(2)}`);
}
{
  const auto = createAutoScale();
  auto.setFloor(AUTO_FLOOR);
  driveAuto(auto, 15000, { dt: 1000 / 60, gpuMs: 22 });
  auto.resetEvidence();
  check('resetEvidence withdraws both asks and every accumulator',
    !auto.state.demote && !auto.state.promote && auto.state.floorOverMs === 0 && auto.state.easyFullMs === 0);
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = failed ? 1 : 0;
