/*
 * stick-response.js: how fast the quad's roll rate follows the stick, flown
 * through the real module, for the radio link, Betaflight's RC smoothing and
 * the PIDs screen's own sliders.
 *
 * WHY THIS EXISTS. Plan item P3.3 (prompts/input-lag-review-2026-09-27.md)
 * put the shell's RC grid (RC_HZ, 250 Hz, in src/main.js) and Betaflight's
 * RC smoothing to the owner, and on 2026-09-28 the owner answered: whatever
 * will deliver a more locked in feeling; it feels a little mushy and could
 * do with a little more authority. Doubling the link rate sounds like that
 * answer, so this asks the module instead of the intuition, and the module
 * said otherwise: see PROGRESS.md, the entry for P3.3.
 *
 * WHAT IT FLIES. The five inch as a pilot meets it: the Betaflight default
 * tune, Betaflight's default rates, the airframe's own weight (gravityBase
 * in configs/airframes.js, 1.62 g), a charged pack, at the hover stick
 * configs/rates.js quotes. The stick reaches the module the way the shell
 * sends it on the perfect link: each RC slot takes the newest pad sample at
 * or before it. The pad is the part a page does not choose. A browser
 * refreshes a radio's axes on its own clock, and the open feel reports on
 * the board on 2026-09-28 said 125 to 242 Hz for radios on Chrome and Edge
 * (stick.flight.padHzMax). So a pad here is a rate, off the RC grid by a
 * fixed phase, with a fixed pattern of jitter; 1 kHz is a source no browser
 * offers today, kept as the ideal.
 *
 * WHAT IT MEASURES.
 *   flick  the stick from centre to full in 40 ms, a fast thumb: the ms the
 *          roll rate takes to reach 10, 50 and 90 percent of where it
 *          settles, and its overshoot
 *   lag    a 2 Hz stick sine at 30 percent, held for eight seconds: how far
 *          the roll rate trails the stick, from the phase of the
 *          fundamental. A rate curve is odd and has no memory, so it shifts
 *          no phase: all of this is the link, the controller and the craft
 *   rough  the RMS of the rate's second difference over the sine, in deg/s
 *          per ms squared: what a staircase of pad samples does to the rate
 *
 * No clock and no random, so a run is the same every time. The stick is
 * computed here and not in the module, so the sine uses Math.sin: that is
 * the pilot, not the physics path CLAUDE.md's rule is about.
 *
 * Usage:
 *   npm run feel:response
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { composeConfig } from '../src/fc/dump.js';
import { RATE_DEFAULTS, hoverStickPercent } from '../configs/rates.js';
import { pidsDiffFor } from '../configs/pids.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = await readFile(join(root, 'dist/sim.wasm'));
const TUNE_ID = 'betaflight-default';
const tune = await readFile(join(root, 'configs', `${TUNE_ID}.diff`), 'utf8');

const CELL_V = 4.2;
const GRAVITY = airframeById('5inch').gravityBase;
const HOVER = hoverStickPercent(100, '5inch', 100, CELL_V) / 100;
/* The profile starts here, after a second of level hover. */
const T0 = 1000;
const DEG = 180 / Math.PI;

/* The pads: an ideal source, and the rates the reports show, each off the
 * RC grid by its own phase so the grid and the pad beat as they do in a
 * browser. */
const PADS = [
  { name: '1 kHz, the ideal', hz: 1000, phase: 0, jitter: 0 },
  { name: '250 Hz', hz: 250, phase: 1.7, jitter: 0.3 },
  { name: '220 Hz', hz: 220, phase: 1.3, jitter: 0.4 },
  { name: '180 Hz', hz: 180, phase: 0.9, jitter: 0.5 },
];

/* What is compared: the shipped link and smoothing, the plan's two levers,
 * and the PIDs screen's feedforward slider, which is the one that moved. */
const ROWS = [
  { name: 'shipped: 250 Hz grid, factory smoothing', rcHz: 250 },
  { name: '500 Hz grid', rcHz: 500 },
  { name: 'lighter smoothing, auto factor 15', rcHz: 250, cli: 'set rc_smoothing_auto_factor = 15' },
  { name: '500 Hz and lighter smoothing', rcHz: 500, cli: 'set rc_smoothing_auto_factor = 15' },
  { name: 'PIDs screen, Stick response FF 150', rcHz: 250, sliders: { ff: 150 } },
  { name: 'PIDs screen, Master multiplier 130', rcHz: 250, sliders: { master: 130 } },
];

/* The pad's sample time at or before `t`: k whole periods past its phase,
 * moved by a fixed pattern of jitter. */
function padTime(t, pad) {
  const period = 1000 / pad.hz;
  const at = (k) => k * period + pad.phase + (pad.jitter ? pad.jitter * Math.sin(k * 12.9898) : 0);
  let k = Math.floor((t - pad.phase) / period);
  while (at(k) > t) {
    k -= 1;
  }
  return at(k);
}

async function fly(row, pad, stick, ms) {
  const sim = await loadSim(wasm);
  const extra = row.cli ? `\n${row.cli}\n` : '';
  const pids = row.sliders ? pidsDiffFor({ [TUNE_ID]: { sliders: row.sliders } }, TUNE_ID) : '';
  const text = composeConfig(tune.replace(/\nbatch end/, `${extra}\nbatch end`), RATE_DEFAULTS, undefined, pids);
  const code = sim.init(text);
  if (code !== SIM_OK) {
    throw new Error(`${row.name}: sim_init refused the config, ${code}`);
  }
  sim.setCellVoltage(CELL_V);
  if (sim.e.sim_set_gravity(GRAVITY) !== SIM_OK) {
    throw new Error(`sim_set_gravity refused ${GRAVITY}`);
  }
  const rcMs = 1000 / row.rcHz;
  let nextRc = 0;
  const p = [];
  for (let t = 0; t < T0 + ms; t += 1) {
    while (nextRc < t + 1) {
      const tp = padTime(nextRc, pad);
      sim.input(nextRc / 1000, tp >= T0 ? stick(tp - T0) : 0, 0, 0, HOVER);
      nextRc += rcMs;
    }
    sim.step(1);
    if (t + 1 >= T0) {
      p.push(sim.readState().state[11] * DEG);
    }
  }
  return p;
}

/* p[i] is the roll rate i ms after the profile starts. */
function flickStats(p) {
  let fin = 0;
  const tail = p.slice(1200);
  for (const v of tail) {
    fin += v;
  }
  fin /= tail.length;
  const at = (f) => p.findIndex((v) => v >= f * fin);
  const peak = Math.max(...p);
  return { t10: at(0.1), t50: at(0.5), t90: at(0.9), over: (peak / fin - 1) * 100 };
}

function sineStats(p, f, from) {
  const period = 1000 / f;
  const n = Math.floor((p.length - from) / period) * period;
  let sr = 0;
  let si = 0;
  let pr = 0;
  let pi = 0;
  let rough = 0;
  for (let i = 0; i < n; i += 1) {
    const w = (2 * Math.PI * f * (from + i)) / 1000;
    const s = Math.sin(w);
    const v = p[from + i];
    sr += s * Math.cos(w);
    si += s * Math.sin(w);
    pr += v * Math.cos(w);
    pi += v * Math.sin(w);
    if (i >= 2) {
      const d2 = v - 2 * p[from + i - 1] + p[from + i - 2];
      rough += d2 * d2;
    }
  }
  let d = Math.atan2(pi, pr) - Math.atan2(si, sr);
  while (d < 0) {
    d += 2 * Math.PI;
  }
  while (d >= 2 * Math.PI) {
    d -= 2 * Math.PI;
  }
  /* For a rate G sin(w (t - lag)) against a stick sin(w t), the rate's
   * fundamental sits w lag further round than the stick's, so d over a
   * whole turn is the lag over a whole period. */
  return { lag: (d / (2 * Math.PI)) * period, rough: Math.sqrt(rough / n) };
}

const cell = (s, w) => String(s).padStart(w);
console.log(`stick-response: the five inch at ${GRAVITY} g, ${CELL_V} V a cell, hover stick ${(HOVER * 100).toFixed(1)} percent, `
  + 'Betaflight default tune and rates, the perfect link');
console.log('flick: centre to full stick in 40 ms, ms to 10, 50 and 90 percent of the settled rate; lag: behind a 2 Hz sine');
for (const pad of PADS) {
  console.log(`\npad ${pad.name}`);
  console.log(`  ${''.padEnd(42)} ${cell('t10', 4)} ${cell('t50', 4)} ${cell('t90', 4)} ${cell('over', 6)} ${cell('lag ms', 7)} ${cell('rough', 6)}`);
  for (const row of ROWS) {
    const flick = flickStats(await fly(row, pad, (t) => (t >= 40 ? 1 : t / 40), 1500));
    const sine = sineStats(await fly(row, pad, (t) => 0.3 * Math.sin((2 * Math.PI * 2 * t) / 1000), 9000), 2, 1000);
    console.log(`  ${row.name.padEnd(42)} ${cell(flick.t10, 4)} ${cell(flick.t50, 4)} ${cell(flick.t90, 4)} `
      + `${cell(`${flick.over.toFixed(1)}%`, 6)} ${cell(sine.lag.toFixed(1), 7)} ${cell(sine.rough.toFixed(3), 6)}`);
  }
}
