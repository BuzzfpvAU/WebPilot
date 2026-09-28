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
 * THE DISPLAY'S PERIOD, which Auto and the GPU guard measure a frame against
 * (autoscale.js, gpugate.js). Both used to measure against 60 Hz, so a Steam
 * Deck in its 40 Hz mode, which quality.js names as Low's target, or any
 * browser holding frames at 30 or 50 Hz, read as late from the first second
 * with the GPU idle, and Auto paced it to the floor and could never climb
 * back (review finding F2, 2026-09-27). So the period is learned from the
 * frames, with one care: a GPU saturated on a 60 Hz display also makes
 * steady 33 ms frames, and that is exactly the case Auto exists for, so it
 * must not be learned as a 30 Hz display. A frame's interval is taken as
 * the display's only when nothing else could have paced it: the page's own
 * callback under half the interval (or half a 60 Hz frame, on a faster
 * display), and, when the world was drawn, the GPU
 * guard's average under half the current target (or no fences to ask,
 * which is ambiguity accepted). The period is the tenth percentile of the
 * last 120 such intervals, snapped to a rate panels actually run at when
 * within five percent of one, and it starts at sixty. The same number is
 * the refresh rate Settings shows, which used to be the quarter percentile
 * of every interval and read 30 Hz on a saturated 60 Hz screen.
 *
 * The TARGET a frame is measured against is the display's period or 60 Hz,
 * whichever is slower: a slower display lowers the bar, a faster one does
 * not raise it, because the aim is sixty, steadily.
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
const SIXTY_MS = 1000 / 60;
/* The rates a learned period is snapped to, when within 5 percent of one:
 * what panels, handhelds and throttling browsers actually run at. */
const RATES = [30, 40, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
/* Trusted frames between estimates, and before the first. */
const LEARN_EVERY = 30;
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
  let sinceLearn = 0;
  /* The display's period as learned, and whether it has been. */
  let displayMs = SIXTY_MS;
  let learned = false;
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

  /* The display's period itself, faster displays included: how far ahead
   * the predicted view looks (src/render/predict.js). */
  function displayPeriodMs() {
    return displayMs;
  }

  /* The frame Auto and the guard measure against: see THE TARGET above. */
  function targetMs() {
    return displayMs > SIXTY_MS ? displayMs : SIXTY_MS;
  }

  /*
   * Every frame, from the frame loop: allocation free. `blockMs` is the
   * frame callback's own length, `gate` the GPU guard's state and `drew`
   * whether anything was drawn that the GPU could have been pacing. Only a
   * frame nothing else could have paced is kept: see THE DISPLAY'S PERIOD.
   */
  function noteFrame(dtMs, blockMs = 0, gate = null, drew = false) {
    if (!(dtMs >= 4) || dtMs > 100) {
      return;
    }
    /* Half the interval, or half a 60 Hz frame on a faster display: at
     * 144 Hz a healthy 5 ms callback is most of the interval, and only a
     * display slower than sixty moves the target anyway. */
    if (blockMs > 0.5 * (dtMs > SIXTY_MS ? dtMs : SIXTY_MS)) {
      return;
    }
    if (drew && gate && gate.on && !(gate.samples >= 10 && gate.gpuMs < targetMs() * 0.5)) {
      return;
    }
    frames[frameAt] = dtMs;
    frameAt = (frameAt + 1) % FRAMES;
    if (frameN < FRAMES) {
      frameN += 1;
    }
    sinceLearn += 1;
    if (frameN >= LEARN_EVERY && sinceLearn >= LEARN_EVERY) {
      sinceLearn = 0;
      learn();
    }
  }

  /* The tenth percentile of the kept intervals, snapped to the nearest
   * real rate within five percent. */
  function learn() {
    const p = quantile(frames, frameN, 0.1);
    let best = p;
    let bestErr = 0.05;
    for (let i = 0; i < RATES.length; i += 1) {
      const period = 1000 / RATES[i];
      const err = Math.abs(p - period) / period;
      if (err <= bestErr) {
        bestErr = err;
        best = period;
      }
    }
    displayMs = best;
    learned = true;
  }

  /* An insertion sort into the scratch copy: at most 120 values, and no
   * subarray view to sort, because learn() runs inside the frame loop and
   * the frame loop allocates nothing (P8). */
  function quantile(src, n, q) {
    for (let i = 0; i < n; i += 1) {
      const v = src[i];
      let j = i - 1;
      while (j >= 0 && scratch[j] > v) {
        scratch[j + 1] = scratch[j];
        j -= 1;
      }
      scratch[j + 1] = v;
    }
    return scratch[Math.min(n - 1, Math.floor(q * n))];
  }

  /* The display's refresh in Hz as learned, or 0 before it has been. */
  function refreshHz() {
    return learned ? Math.round(1000 / displayMs) : 0;
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

  return { supported, noteFrame, refreshHz, targetMs, displayPeriodMs, report };
}
