/*
 * predict.js: the view drawn where the quad will be when the frame is seen,
 * not where it was when the frame began.
 *
 * WHY THIS EXISTS. A frame is drawn from the state at its own start and is
 * on the glass a display period later at the soonest, so the picture always
 * shows the quad one frame in the past: at sixty, 17 ms, which at a 670
 * degree per second roll is eleven degrees behind the sticks. The page
 * cannot draw sooner, but it can draw what is about to be true. The state
 * block carries everything a one frame prediction needs (src/native/
 * sim_abi.h: velocity in the world frame at [4..6], body rates at
 * [11..13]), so the drawn pose is moved on by those over the horizon, the
 * way a VR runtime draws the head where it will be at display time. Phase 3
 * item 1 of prompts/input-lag-review-2026-09-27.md, on the owner's ask of
 * 2026-09-28.
 *
 * HOW WRONG IT CAN BE. Constant velocity and constant rate over one frame.
 * The error is the change of rate over the horizon: half the angular
 * acceleration times the horizon squared, a couple of degrees at the start
 * or the end of a snap roll on a five inch, and gone the next frame, which
 * is predicted from the rate as it then is. Position errs by half the
 * acceleration times the horizon squared, millimetres.
 *
 * RENDER ONLY. The physics, the trace, the lap, the replay files and every
 * determinism check never see it: main.js moves the CAMERA, a rigid mount
 * on the craft, just before the draw, and every piece of logic reads the
 * craft's own pose, which is not touched. The conversions are frame.js's,
 * the one place coordinates change frames: the displacement goes through
 * simPosToThree and the rotation through simQuatToThree, because the basis
 * change is a fixed rotation and a body frame increment converts with it.
 *
 * Plain arithmetic on objects with x, y, z (and w), so the same functions
 * take Three.js vectors in the page and plain objects in the Node selftest
 * (scripts/predict-selftest.js). Nothing allocates: the caller hands in its
 * own scratch objects.
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

import { simPosToThree, simQuatToThree } from './frame.js';

/* No prediction reaches further than this: a frame that late is a hitch,
 * and throwing the picture a hitch ahead is worse than drawing it late. */
export const PREDICT_MAX_MS = 25;

/* v rotated by the unit quaternion q, in place: v' = q v q*. */
export function rotateVec(q, v) {
  const x = v.x;
  const y = v.y;
  const z = v.z;
  /* t = 2 (q.xyz cross v) */
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  /* v' = v + w t + q.xyz cross t */
  v.x = x + q.w * tx + (q.y * tz - q.z * ty);
  v.y = y + q.w * ty + (q.z * tx - q.x * tz);
  v.z = z + q.w * tz + (q.x * ty - q.y * tx);
  return v;
}

/* out = a b (Hamilton product), out may be a or b. Written with set(x, y,
 * z, w): a Three.js quaternion's components are setters, and on an
 * object's own quaternion each one re-derives its Euler rotation. */
export function mulQuat(a, b, out) {
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  return out.set(x, y, z, w);
}

/*
 * The change over `horizonMs` of a craft moving at the state's velocity and
 * turning at its body rates, in the drawn frame: `dp` the displacement in
 * world metres, `dq` the body frame rotation increment, to be multiplied
 * onto the drawn quaternion on the right. `spawn` is the drawn frame's yaw
 * about the sim origin (qSpawn in main.js).
 */
export function predictDelta(state, horizonMs, spawn, dp, dq) {
  const t = horizonMs / 1000;
  simPosToThree(state[4] * t, state[5] * t, state[6] * t, dp);
  rotateVec(spawn, dp);
  const wx = state[11];
  const wy = state[12];
  const wz = state[13];
  const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
  const half = 0.5 * w * t;
  const s = w > 1e-9 ? Math.sin(half) / w : 0.5 * t;
  simQuatToThree(Math.cos(half), wx * s, wy * s, wz * s, dq);
  return dq;
}

/*
 * A camera rigidly mounted on a craft drawn at `p`, `q`, moved with it by
 * `dp` and the body increment `dq`: it turns by the same world rotation
 * R = q dq q^-1 about the craft, and travels with it.
 *   camPos' = p + dp + R (camPos - p)
 *   camQuat' = R camQuat
 * `r` and `v` are the caller's scratch quaternion and vector.
 */
export function moveRigid(camPos, camQuat, p, q, dp, dq, r, v) {
  /* R = q dq q^-1, q a unit quaternion so its inverse is its conjugate. */
  mulQuat(q, dq, r);
  const cw = q.w;
  const cx = -q.x;
  const cy = -q.y;
  const cz = -q.z;
  const w = r.w * cw - r.x * cx - r.y * cy - r.z * cz;
  const x = r.w * cx + r.x * cw + r.y * cz - r.z * cy;
  const y = r.w * cy - r.x * cz + r.y * cw + r.z * cx;
  const z = r.w * cz + r.x * cy - r.y * cx + r.z * cw;
  r.set(x, y, z, w);
  v.x = camPos.x - p.x;
  v.y = camPos.y - p.y;
  v.z = camPos.z - p.z;
  rotateVec(r, v);
  camPos.x = p.x + dp.x + v.x;
  camPos.y = p.y + dp.y + v.y;
  camPos.z = p.z + dp.z + v.z;
  mulQuat(r, camQuat, camQuat);
  return camPos;
}
