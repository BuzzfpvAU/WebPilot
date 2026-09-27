/*
 * flightperf.js: what the frames cost WHILE FLYING, kept for the bug report.
 *
 * WHY THIS EXISTS. A report's fps was one number, an average of the last few
 * frames at the moment the pilot pressed F8 or opened the form, and that
 * moment is the pause screen or a quad sat on the start line. bug-e82b8bb8,
 * "nearly impossible to fly with input lag", arrived saying 60 fps from the
 * pause screen, which is a statement about the pause screen. So the flight
 * keeps its own record, the way input.js keeps the stick path's: the last
 * ten seconds or so of flying frames, and nothing from any menu.
 *
 * What a frame writes is two numbers into a ring: the frame interval, which
 * is what the pilot saw, and the frame callback's own length, which is what
 * this page cost the main thread. Nothing allocates per frame. The report is
 * built when it is asked for, which is once per ticket.
 *
 * The interval is what the browser gave, capped at the frame loop's own
 * 100 ms, so a tab that was hidden shows as one long frame rather than as a
 * minute of nothing. A draw the loop chose to skip is counted separately by
 * main.js; this only knows that a frame happened.
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

/* About ten seconds at 60 Hz, five at 120. Enough to hold the complaint and
 * short enough that a flight which started badly and settled reads as the
 * settled one, which is the one the pilot is reporting on. */
export const FLIGHT_PERF_FRAMES = 600;

export function createFlightPerf(size = FLIGHT_PERF_FRAMES) {
  const dt = new Float32Array(size);
  const block = new Float32Array(size);
  const scratch = new Float32Array(size);
  let at = 0;
  let count = 0;

  function note(dtMs, blockMs) {
    if (!(dtMs > 0)) {
      return;
    }
    dt[at] = dtMs;
    block[at] = blockMs > 0 ? blockMs : 0;
    at = (at + 1) % size;
    if (count < size) {
      count += 1;
    }
  }

  /* The value at fraction q of the sorted window, from the scratch copy. */
  function quantile(src, q) {
    for (let i = 0; i < count; i += 1) {
      scratch[i] = src[i];
    }
    const view = scratch.subarray(0, count);
    view.sort();
    return view[Math.min(count - 1, Math.floor(q * count))];
  }

  /*
   * The window as a ticket carries it, or null before any flying. Tenths of
   * a millisecond: the question is "were frames arriving at the display's
   * rate, and were some of them long", and a hundredth answers nothing a
   * tenth does not.
   */
  function report() {
    if (count === 0) {
      return null;
    }
    let over25 = 0;
    let over50 = 0;
    let longest = 0;
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      const d = dt[i];
      sum += d;
      if (d > 25) {
        over25 += 1;
      }
      if (d > 50) {
        over50 += 1;
      }
      if (d > longest) {
        longest = d;
      }
    }
    const tenth = (v) => Math.round(v * 10) / 10;
    const mid = quantile(dt, 0.5);
    return {
      frames: count,
      seconds: tenth(sum / 1000),
      fps: mid > 0 ? Math.round(1000 / mid) : 0,
      frameMs: [tenth(mid), tenth(quantile(dt, 0.95)), tenth(longest)],
      over25,
      over50,
      pageMs: [tenth(quantile(block, 0.5)), tenth(quantile(block, 0.95))],
    };
  }

  function reset() {
    at = 0;
    count = 0;
  }

  return { note, report, reset };
}
