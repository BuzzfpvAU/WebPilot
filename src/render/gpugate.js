/*
 * gpugate.js: how long the GPU takes over a frame, and a guard that keeps a
 * saturated GPU from queueing frames behind each other.
 *
 * WHY THIS EXISTS. A frame the page has drawn is not a frame on the glass: the
 * GPU works through it after the frame callback returns, and while it is busy
 * with one the browser happily accepts the next. On a machine whose GPU needs
 * nearly the whole frame, that queue fills, and every frame the pilot sees is
 * one or two frames older than the sticks that made it. The frame rate says
 * 60 throughout, because the frames do arrive at 60; they arrive late. That is
 * the shape of bug-e82b8bb8, "nearly impossible to fly with input lag" on an
 * Iris Xe laptop reporting 60 fps.
 *
 * WHAT IT MEASURES. After each draw the shell drops a WebGL2 fence. WebGL
 * only updates a fence's status between tasks, so it is polled from the
 * sticks' own timer (every few milliseconds, see startPolling in
 * src/input/input.js) as well as from the next frame, and the moment it is
 * first seen signalled is close to the moment the GPU finished. gpuMs is an
 * average of that delay: the time from the end of the draw call to the end
 * of the GPU's work on it, queue included. It is an upper bound on the GPU
 * time, by up to a poll interval.
 *
 * WHAT IT DOES, AND WHY SO LITTLE. The guard skips a draw when the previous
 * frame is still on the GPU, so at most one frame is ever in flight, which is
 * the queue gone. It does that ONLY when the average says the GPU really is
 * saturated. Measured in headless Chromium on 2026-09-27: with a trivially
 * cheap draw, the fence still read unsignalled at the next frame about one
 * frame in sixteen, whether or not a timer polled it. A guard that trusted a
 * single reading would drop those frames for nothing, and a dropped frame is
 * itself felt as lag. So the single reading is only believed when the average
 * already says the GPU needs most of a frame, and never twice in a row: at
 * worst it halves the draw rate of a GPU that could not hold it anyway, while
 * the resolution controller (autoscale.js) brings the load down.
 *
 * Nothing here reads or writes the physics. A skipped draw is the frame cap's
 * contract: input was polled, the accumulator stepped, only the picture waits.
 * No allocation per frame beyond the fence object WebGL itself hands back.
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

/* The guard engages when the GPU's average share of a frame passes this. */
export const GATE_SATURATED = 0.85;
/* A frame's worth of work, at the rate this page holds: 60 Hz, or the
 * display's own period when that is slower, which main.js passes (targetMs in
 * latency.js). A faster display does not raise the bar; the aim is sixty,
 * steadily. A slower one lowers it: measured against sixty, a GPU keeping a
 * 40 Hz display comfortably fed at 18 ms a frame read as saturated, and the
 * guard held half its draws (review F2, reproduced in the selftest). */
export const GATE_FRAME_MS = 1000 / 60;
/*
 * A fence older than this when it is first seen signalled was not timing the
 * GPU. It was timing a freeze: a tab hidden or frozen with the fence pending
 * (the sticks' timer, which polls it, stops with the page), a context lost
 * and restored, or a main thread stall long enough that nobody looked. Found
 * in the review of 2026-09-27: a page frozen for three seconds took the
 * average from 155 ms to 759 ms in two samples, and on a real GPU that is the
 * guard halving the draw rate for a second or more after every alt tab. A
 * frame that truly needs a quarter of a second of GPU is four frames a
 * second; there is nothing left for the guard to protect there, and Auto has
 * the frame interval to see it by.
 */
export const GATE_FREEZE_MS = 250;

/* Fences kept in flight at once. A GPU four frames behind is timed as at
 * least that far behind, which is all the guard needs to know. */
const RING = 4;

export function createGpuGate(gl) {
  const ok = Boolean(gl && typeof gl.fenceSync === 'function'
    && typeof gl.getSyncParameter === 'function' && typeof gl.deleteSync === 'function');
  /*
   * A ring, not one fence: on a saturated GPU the last frame's fence is
   * usually still pending when the next draw goes in, and dropping it then
   * would time only the frames that finished quickly, which is the one case
   * the average must not be blind to.
   */
  const fences = new Array(RING).fill(null);
  const at = new Float64Array(RING);
  let head = 0;
  const s = {
    /* Whether this context can fence at all. */
    on: ok,
    /* Average ms from the end of a draw to the GPU finishing it, the queue
     * in front of it included. */
    gpuMs: 0,
    /* How many fences have been timed, so a caller knows gpuMs means
     * something. */
    samples: 0,
    /* Draws skipped because the last frame was still on the GPU, and draws
     * made, since the page loaded. */
    skipped: 0,
    drawn: 0,
    /* Whether the last draw attempt was skipped: never two in a row. */
    lastSkipped: false,
  };

  function time(ms) {
    /* A freeze, not a frame: see GATE_FREEZE_MS. Dropped untimed. */
    if (!(ms >= 0) || ms > GATE_FREEZE_MS) {
      return;
    }
    s.gpuMs = s.samples === 0 ? ms : s.gpuMs + (ms - s.gpuMs) * 0.1;
    s.samples += 1;
  }

  function drop(i) {
    try {
      gl.deleteSync(fences[i]);
    } catch (e) {
      /* Already gone with the context. */
    }
    fences[i] = null;
  }

  function poll(now) {
    if (!ok) {
      return;
    }
    for (let i = 0; i < RING; i += 1) {
      const f = fences[i];
      if (!f) {
        continue;
      }
      let st = 0;
      try {
        st = gl.getSyncParameter(f, gl.SYNC_STATUS);
      } catch (e) {
        /* A lost context: stop timing this fence rather than throw every
         * frame. */
        st = gl.SIGNALED;
      }
      if (st === gl.SIGNALED) {
        time(now - at[i]);
        drop(i);
      }
    }
  }

  /*
   * Should this frame's draw wait? True only when the GPU is saturated on
   * average AND the previous frame is still on it AND the last draw was not
   * already skipped. `enabled` is the caller's switch (Low latency view),
   * `targetMs` the frame to measure saturation against (see GATE_FRAME_MS).
   */
  function shouldSkip(now, enabled, targetMs = GATE_FRAME_MS) {
    if (!ok || !enabled) {
      s.lastSkipped = false;
      return false;
    }
    poll(now);
    const frame = targetMs > GATE_FRAME_MS ? targetMs : GATE_FRAME_MS;
    const saturated = s.samples >= 10 && s.gpuMs > GATE_SATURATED * frame;
    if (saturated && fences[head] !== null && !s.lastSkipped) {
      s.lastSkipped = true;
      s.skipped += 1;
      return true;
    }
    s.lastSkipped = false;
    return false;
  }

  /* Right after a draw: a fence behind it. The slot it takes, if still
   * pending, is a frame RING draws old: it is timed as at least that old. */
  function submitted(now) {
    if (!ok) {
      return;
    }
    head = (head + 1) % RING;
    if (fences[head]) {
      time(now - at[head]);
      drop(head);
    }
    try {
      fences[head] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    } catch (e) {
      fences[head] = null;
    }
    at[head] = now;
    s.drawn += 1;
  }

  /*
   * Forget the fences, untimed. main.js calls this when a tab is hidden, when
   * the context is lost or restored, and when the render targets are
   * reallocated (a window resize or a new render scale), because a fence
   * pending across any of those is timing the event and not the GPU. The
   * average is kept: it is still this GPU drawing this world.
   *
   * `newWorld` forgets the average too, for a map swap: the old world's
   * GPU time says nothing about the new one's, and a guard holding draws on
   * a light world because a heavy one was saturated is the lag this module
   * exists to remove. Ten fresh samples, a sixth of a second at sixty, and
   * it knows again.
   */
  function reset(newWorld = false) {
    for (let i = 0; i < RING; i += 1) {
      if (fences[i]) {
        drop(i);
      }
    }
    s.lastSkipped = false;
    if (newWorld) {
      s.gpuMs = 0;
      s.samples = 0;
    }
  }

  return { state: s, poll, shouldSkip, submitted, reset };
}
