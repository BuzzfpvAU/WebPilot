/*
 * scale-check.js: the Render scale slider reaches the pixels, on every kind
 * of world, and comes back.
 *
 * WHY THIS EXISTS. lint:quality has checked since the slider shipped that
 * "the Render scale slider reaches the internal buffer", and it passed the
 * whole time the town's and a built map's pipelines ignored it: it checks
 * internalScale, the FORMULA, and the pipelines size their targets with
 * their own math. Auto graphics (src/render/autoscale.js) moves the same
 * factor, so on the freestyle worlds it walked its factor to the floor with
 * no effect on a single pixel (review finding F1, 2026-09-27). This check
 * asks the running page instead: the pipeline's own targets, and the
 * canvas's own ratio, before and after the slider moves.
 *
 * What each world must do, from the same numbers the page uses:
 *   the race field   the canvas's pixel ratio falls with the slider, and
 *                    there is no pipeline of its own to ask
 *   the town, a      the pipeline's targets fall with the slider, never
 *   built map        under the preset's minScale of the CSS size, and the
 *                    canvas keeps the preset's own ratio, because taking
 *                    the factor in both places lowers the picture twice
 * and each comes back exactly when the slider goes back to 100.
 *
 * Usage:
 *   npm run lint:scale
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { qualityFor } from '../src/render/quality.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The worlds, each at a preset whose floor leaves the slider room to work
 * or shows it has none, and whether its pipeline scales its own targets. */
const CASES = [
  { map: 'field', graphics: 'high', own: false },
  { map: 'built', graphics: 'high', own: true },
  { map: 'built', graphics: 'low', own: true },
  { map: 'city', graphics: 'low', own: true },
];

const failures = [];
const rows = [];

function expect(what, ok, detail) {
  rows.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${what.padEnd(64)} ${detail}`);
  if (!ok) {
    failures.push(`${what}: ${detail}`);
  }
}

async function readScale(page) {
  return JSON.parse(await page.evaluate('JSON.stringify(window.__scaleAt(window.innerWidth, window.innerHeight))'));
}

async function setSlider(page, pct) {
  await page.evaluate(`(() => { const ui = window.__ui; ui.settings.renderScale = ${pct};
    ui.onSettings(ui.settings); return 1; })()`);
  /* The resize is synchronous in applyRenderScale; a frame lets anything
   * that follows it land before the page is read. */
  await page.sleep(400);
}

async function runCase({ map, graphics, own }) {
  const label = `${map} at ${graphics}`;
  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    url: `/index.html?map=${map}&craft=5inch`,
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.map = ${JSON.stringify(map)};
      s.graphics = ${JSON.stringify(graphics)};
      s.graphicsAuto = false;
      s.renderScale = 100;
      s.airframe = '5inch';
      s.airframeAsked = true;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused. The run still boots. */ }`],
  });
  try {
    await page.until("window.__shellReady === true && window.__ui && window.__map && window.__map().ready === true", 240000);
    await page.sleep(1500);
    const full = await readScale(page);
    await setSlider(page, 55);
    const low = await readScale(page);
    await setSlider(page, 100);
    const back = await readScale(page);
    if (!own) {
      expect(`${label}: no pipeline of its own`, full.pipeline === null, JSON.stringify(full.pipeline));
      expect(`${label}: the canvas ratio falls with the slider`, low.pixelRatio < full.pixelRatio - 1e-6,
        `${full.pixelRatio.toFixed(3)} to ${low.pixelRatio.toFixed(3)}`);
      expect(`${label}: and comes back`, Math.abs(back.pixelRatio - full.pixelRatio) < 1e-9,
        `${back.pixelRatio.toFixed(3)}`);
      return;
    }
    const q = qualityFor(graphics).city;
    const p0 = full.pipeline;
    const p1 = low.pipeline;
    const p2 = back.pipeline;
    expect(`${label}: the pipeline reports its own scale`, Boolean(p0 && p1 && p2), JSON.stringify(p0));
    if (!(p0 && p1 && p2)) {
      return;
    }
    /* What the pipeline must do at 55: the full scale times 0.55, never
     * under minScale (or under the full scale, where a preset's floor is
     * above it). */
    const floor = Math.min(q.minScale, p0.scale);
    const want = Math.max(floor, p0.scale * 0.55);
    expect(`${label}: at 55 the targets follow the slider to their floor`,
      Math.abs(p1.scale - want) < 1e-9 && p1.rw === Math.max(2, Math.floor(low.w * want)),
      `scale ${p0.scale.toFixed(4)} to ${p1.scale.toFixed(4)} (want ${want.toFixed(4)}), ${p0.rw}x${p0.rh} to ${p1.rw}x${p1.rh}`);
    expect(`${label}: and the pixels really fall where the floor allows`,
      want < p0.scale - 1e-9 ? p1.rw * p1.rh < p0.rw * p0.rh : p1.rw === p0.rw,
      `${p0.rw * p0.rh} to ${p1.rw * p1.rh}`);
    expect(`${label}: the canvas keeps the preset's own ratio`, Math.abs(low.pixelRatio - full.pixelRatio) < 1e-9,
      `${full.pixelRatio.toFixed(3)} and ${low.pixelRatio.toFixed(3)}`);
    expect(`${label}: Auto is told where the floor is`,
      typeof p0.autoFloor === 'number' && Math.abs(p0.autoFloor - floor / p0.scale) < 1e-9,
      `autoFloor ${typeof p0.autoFloor === 'number' ? p0.autoFloor.toFixed(4) : 'not reported'}`);
    expect(`${label}: and back at 100 it is exactly where it was`,
      Math.abs(p2.scale - p0.scale) < 1e-9 && p2.rw === p0.rw && p2.rh === p0.rh,
      `${p2.rw}x${p2.rh}, scale ${p2.scale.toFixed(4)}`);
    const errors = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    expect(`${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await page.close();
  }
}

async function main() {
  for (const c of CASES) {
    await runCase(c);
  }
  console.log(rows.join('\n'));
  console.log('');
  if (failures.length) {
    console.error(`FAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.error(`  ${f}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('PASS, the Render scale slider reaches the pixels on every world, and comes back');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
