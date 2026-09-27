/*
 * latency.js: how long this browser takes to put an input on the screen, and
 * how fast the screen refreshes, for Settings and the bug report.
 *
 * WHY THIS EXISTS. "Input lag" is the one complaint this page could not put a
 * number on. The frame rate is the wrong number (bug-e82b8bb8 said 60 fps and
 * was unflyable), because the time a frame spends queued behind the page, the
 * compositor and the display never shows in it. This measures the part a page
 * CAN see: the browser's own Event Timing API reports, for a key press or a
 * click, the time from the moment the hardware delivered it to the moment the
 * next frame after it was presented. A radio has no events, but its samples
 * reach the screen through the same frames, so a key press is a fair probe of
 * the pipeline a radio's stick goes through too, less the stick's own poll.
 *
 * What it cannot see is the display's own delay after the frame is presented,
 * which is the monitor's business, and it never claims to. It is a reading of
 * this browser on this machine, not a measurement of photon latency, and the
 * Settings note says which it is.
 *
 * The browser only reports events of 16 ms or more, so a very fast pipeline
 * reads as its slow events. The median of the last 64 reported presses is the
 * number shown; the 90th percentile rides along for the report.
 *
 * The refresh rate is from the frame intervals the page already has: the
 * quarter percentile of the last 120, which is the display's period whenever
 * the page is keeping up with it at all.
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

const PRESSES = 64;
const FRAMES = 120;
/* The events that are a person pressing something, which is the question.
 * Moves and hovers are not asked about. */
const PRESS_EVENTS = new Set(['keydown', 'pointerdown', 'mousedown', 'click']);

export function createLatencyMeter() {
  const presses = new Float32Array(PRESSES);
  const frames = new Float32Array(FRAMES);
  const scratch = new Float32Array(FRAMES);
  let pressAt = 0;
  let pressN = 0;
  let frameAt = 0;
  let frameN = 0;
  let supported = false;

  try {
    if (typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes
      && PerformanceObserver.supportedEntryTypes.includes('event')) {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (PRESS_EVENTS.has(e.name) && e.duration > 0) {
            presses[pressAt] = e.duration;
            pressAt = (pressAt + 1) % PRESSES;
            if (pressN < PRESSES) {
              pressN += 1;
            }
          }
        }
      });
      po.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      supported = true;
    }
  } catch (e) {
    supported = false;
  }

  /* Every frame, from the frame loop: allocation free. */
  function noteFrame(dtMs) {
    if (!(dtMs > 0) || dtMs > 100) {
      return;
    }
    frames[frameAt] = dtMs;
    frameAt = (frameAt + 1) % FRAMES;
    if (frameN < FRAMES) {
      frameN += 1;
    }
  }

  function quantile(src, n, q) {
    for (let i = 0; i < n; i += 1) {
      scratch[i] = src[i];
    }
    const view = scratch.subarray(0, n);
    view.sort();
    return view[Math.min(n - 1, Math.floor(q * n))];
  }

  /* The display's refresh in Hz, or 0 before there are frames to read. */
  function refreshHz() {
    if (frameN < 30) {
      return 0;
    }
    const period = quantile(frames, frameN, 0.25);
    return period > 0 ? Math.round(1000 / period) : 0;
  }

  /* The readout: key to screen in ms, median and 90th percentile, and how
   * many presses it is from. Null before the first reported press. */
  function report() {
    if (pressN === 0) {
      return null;
    }
    return {
      ms: Math.round(quantile(presses, pressN, 0.5)),
      p90: Math.round(quantile(presses, pressN, 0.9)),
      n: pressN,
    };
  }

  return { supported, noteFrame, refreshHz, report };
}
