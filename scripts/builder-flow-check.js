/*
 * builder-flow-check.js: the whoop builder, driven the way a person drives it.
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

/*
 * WHY THIS IS A BROWSER CHECK AND NOT MORE OF THE SELF TEST.
 *
 * src/trackbuilder/selftest.js runs the builder's pure modules in Node, and it
 * cannot see the things a pilot meets first: whether a click in the middle of
 * a gate picks it, whether a number covers the gate it names, whether Fit puts
 * the track on the screen, whether a click that only selects leaves an undo
 * step behind. Every one of those was true of the whoop builder on
 * 2026-09-29 (WHOOP-BUILDER-PLAN.md, section 1), and none of them was visible
 * to any check that existed. This one drives the real page in headless
 * Chromium with real mouse events, the way scripts/device-check.js drives the
 * real menus, and asserts on what came out.
 *
 * It grows a stage at a time with the plan: Stage 0 is the repairs, and the
 * later cases build a track from an empty canvas with the pointer alone.
 *
 * `--root=DIR` runs it against another checkout, which is how a case is shown
 * to fail on the code as it stood before a fix. `--only=NAME` runs one case.
 */

import { openPage } from '../tests/lib/page.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? resolve(rootArg.slice('--root='.length)) : HERE;
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : '';

const failures = [];

/* The numbers are printed on a pass as well as on a fail: "62 percent" says
 * how far inside the line a case is, which a bare PASS does not. */
function check(name, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures.push(name);
  }
}

/* The page's network errors are the board and the counter being unreachable
 * from a container, which is not what this is checking. Anything else the page
 * reports, an uncaught error or a console error of its own, is. */
function ownErrors(page) {
  return page.errors.filter((e) => !/Failed to load resource|net::ERR_/.test(e));
}

async function openBuilder(query = '?class=micro', width = 1600, height = 900) {
  const page = await openPage({ root, width, height, url: `/src/trackbuilder/index.html${query}` });
  await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
  return page;
}

/* Load also lists the shipped tracks, which is noise in a line that is about
 * what somebody's own work turned into. */
const ownTracks = (names) => names.filter((n) => !/^RaceGOW/.test(n)).map((n) => `"${n}"`).join(', ') || 'none of it';

const json = async (page, expression) => JSON.parse(await page.evaluate(`JSON.stringify(${expression})`));

/* A real mouse click: the pointer moves there, presses and lets go, which is
 * three pointer events in the page, the same as a hand. */
async function mouse(page, type, x, y, buttons) {
  await page.cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1,
  }, page.sessionId);
}

async function click(page, x, y) {
  await mouse(page, 'mouseMoved', x, y, 0);
  await mouse(page, 'mousePressed', x, y, 1);
  await page.sleep(50);
  await mouse(page, 'mouseReleased', x, y, 0);
  await page.sleep(80);
}

/* A shipped whoop track, loaded as the working track. */
async function loadPreset(page, id) {
  await page.evaluate(`(async () => {
    const { PRESETS } = await import('/src/trackbuilder/presets.js');
    window.trackBuilder.loadDocument(JSON.parse(JSON.stringify(PRESETS.find((p) => p.id === '${id}'))), '');
    return 1;
  })()`);
}

/*
 * Where a document point is on the page, in viewport pixels, worked out here
 * from the view's own matrices and not by asking the view. A check that asked
 * the view where a gate is would agree with whatever the view believed, and
 * this is checking what a pilot sees; it also has to run against a checkout
 * that has none of the newer methods, which is how a case is shown to fail
 * before its fix. The room's root group is the one place a document point
 * becomes a scene point, so it is asked to.
 */
async function screenOf(page, view, x, y, z = 0) {
  return json(page, `(() => {
    const v = window.trackBuilder.${view};
    const r = v.canvas.getBoundingClientRect();
    if (${view === 'view2d'}) {
      const p = v.toScreen({ x: ${x}, y: ${y} });
      return { x: r.left + p.x, y: r.top + p.y };
    }
    v.applyCamera();
    v.camera.updateMatrixWorld(true);
    v.root.updateMatrixWorld(true);
    const p = new v.camera.position.constructor(${x}, ${y}, ${z});
    v.root.localToWorld(p);
    p.project(v.camera);
    return p.z < -1 || p.z > 1 ? null : { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, w: r.width };
  })()`);
}

async function inThreeD(page) {
  await page.evaluate("window.trackBuilder.setMode('3d'), 1");
  await page.until('!!window.trackBuilder.view3d.renderer && !window.trackBuilder.view3d.dirty', 60000);
  await page.sleep(300);
}

/* ------------------------------------------------------------------ */
/* The cases                                                           */
/* ------------------------------------------------------------------ */

const CASES = [];
const kase = (name, fn) => CASES.push([name, fn]);

/*
 * A CLICK THAT ONLY SELECTS IS NOT AN EDIT. Pressing an element began an undo
 * gesture, and finishing it stamped the track as modified a second after the
 * last stamp, so history recorded a step called "move" and Undo then seemed to
 * do nothing.
 */
kase('select', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(1300); /* past a clock second, or a stamp could not differ */
    const t = await json(page, `(() => {
      const app = window.trackBuilder;
      const el = app.doc.elements.find((e) => e.type === 'gate');
      const s = app.view2d.toScreen({ x: el.position.x, y: el.position.y });
      const r = app.view2d.canvas.getBoundingClientRect();
      return { id: el.id, x: r.left + s.x, y: r.top + s.y, past: app.history.past.length, stamp: app.doc.modifiedUtc };
    })()`);
    await click(page, t.x, t.y);
    await page.until(`window.trackBuilder.selection.has('${t.id}')`, 10000);
    const after = await json(page, '({ past: window.trackBuilder.history.past.length, stamp: window.trackBuilder.doc.modifiedUtc })');
    check('a click that only selects a gate is not an undo step', after.past === t.past, `${t.past} steps before, ${after.past} after`);
    check('and does not change the stamp that says when the track last changed', after.stamp === t.stamp, `${t.stamp} then ${after.stamp}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * FIT AND EVERY LOAD FRAME THE TRACK. On 2026-09-29 both views framed the
 * whole 10 by 12 m hall, so a track a metre or two across opened as a small
 * cluster in an empty rectangle.
 */
/* How much of a view's drawing area the loaded track's own extent takes, across,
 * and whether all of it is inside. Measured from the elements' positions and
 * projected by the check itself, see screenOf. */
async function measureExtent(page, view) {
  const corners = await json(page, `(() => {
    const els = window.trackBuilder.doc.elements;
    const xs = els.map((e) => e.position.x);
    const ys = els.map((e) => e.position.y);
    return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.min(...xs), Math.max(...ys)], [Math.max(...xs), Math.max(...ys)]];
  })()`);
  const pts = [];
  for (const [x, y] of corners) {
    pts.push(await screenOf(page, view, x, y, 0));
  }
  const box = await json(page, `(() => { const r = window.trackBuilder.${view}.canvas.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; })()`);
  const left = Math.min(...pts.map((p) => p.x));
  const right = Math.max(...pts.map((p) => p.x));
  const top = Math.min(...pts.map((p) => p.y));
  const bottom = Math.max(...pts.map((p) => p.y));
  return {
    across: (right - left) / (box.r - box.l),
    inside: left >= box.l && right <= box.r && top >= box.t && bottom <= box.b,
    wide: Math.round(box.r - box.l),
  };
}

kase('fit', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await page.evaluate("window.trackBuilder.setMode('2d'), window.trackBuilder.frameAll(), 1");
    await page.sleep(200);
    const plan = await measureExtent(page, 'view2d');
    check('a whoop track loaded on the plan takes at least 40 percent of the drawing area across', plan.across >= 0.4, `${(plan.across * 100).toFixed(0)} percent`);
    /* The track was loaded while the plan was showing, so the room's canvas
     * had no size to frame for. Going to it must not leave it framed for a
     * canvas that was not there: no Fit here, on purpose. */
    await inThreeD(page);
    const flipped = await measureExtent(page, 'view3d');
    check('a track loaded on the plan, then seen in the room, is framed there without asking', flipped.across >= 0.25 && flipped.inside, `${(flipped.across * 100).toFixed(0)} percent, inside ${flipped.inside}`);
    await page.evaluate('window.trackBuilder.frameAll(), 1');
    await page.sleep(300);
    const room = await measureExtent(page, 'view3d');
    check('and Fit in the room takes at least 25 percent, all of it in view', room.across >= 0.25 && room.inside, `${(room.across * 100).toFixed(0)} percent, inside ${room.inside}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE SAME IN A WINDOW TALLER THAN IT IS WIDE. A camera frames a sphere by its
 * narrower field of view, and a load on the plan frames a canvas that has no
 * size, so it assumed a wide one. In a wide window that is the same answer;
 * in a narrow one the track was framed for a window it was not in and ran off
 * both sides. At 820 wide the builder's canvas is about 320.
 */
kase('fit narrow', async () => {
  const page = await openBuilder('?class=micro', 820, 900);
  try {
    await loadPreset(page, 'racegow5-track1');
    await inThreeD(page);
    const m = await measureExtent(page, 'view3d');
    check('in a narrow window the whole track is in view in the room', m.inside && m.across >= 0.25, `${(m.across * 100).toFixed(0)} percent of ${m.wide} px, inside ${m.inside}`);
  } finally {
    await page.close();
  }
});

/*
 * THE MIDDLE OF A GATE PICKS IT. Only the pipes could be picked in the room,
 * 26.7 mm of PVC that is three or four pixels at any distance that shows a
 * whole track.
 */
kase('pick', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await inThreeD(page);
    await page.evaluate('window.trackBuilder.frameAll(), 1');
    await page.sleep(300);
    const gates = await json(page, `window.trackBuilder.doc.elements.filter((e) => e.type === 'gate').map((e) => ({ id: e.id, x: e.position.x, y: e.position.y, z: e.dims.sillH + e.dims.clearH / 2 }))`);
    let picked = 0;
    const missed = [];
    for (const g of gates) {
      await page.evaluate('window.trackBuilder.setSelection([]), 1');
      const at = await screenOf(page, 'view3d', g.x, g.y, g.z);
      if (!at) {
        missed.push(`${g.id} off screen`);
        continue;
      }
      await click(page, at.x, at.y);
      const hit = await page.evaluate(`window.trackBuilder.selection.has('${g.id}')`);
      if (hit) {
        picked += 1;
      } else {
        missed.push(g.id);
      }
    }
    check('a click in the middle of a gate selects it, for most single gates on Track 1', gates.length > 0 && picked / gates.length >= 0.75, `${picked} of ${gates.length}${missed.length ? `, missed ${missed.join(', ')}` : ''}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A NUMBER DOES NOT COVER THE GATE IT NAMES. A whoop's order numbers were
 * 0.33 m tall over a gate 0.71 m across.
 */
kase('labels', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await inThreeD(page);
    const m = await json(page, `(() => {
      const v = window.trackBuilder.view3d;
      let tallest = 0;
      v.root.traverse((o) => { if (o.isSprite) tallest = Math.max(tallest, o.scale.y); });
      const g = window.trackBuilder.doc.elements.find((e) => e.type === 'gate');
      return { tallest, gate: g.dims.clearH };
    })()`);
    check('the tallest number is under a third of the height of a gate', m.tallest > 0 && m.tallest < m.gate / 3, `${m.tallest.toFixed(3)} m against a gate ${m.gate.toFixed(3)} m`);
  } finally {
    await page.close();
  }
});

/*
 * IMPORT AND A ?track= LINK KEEP WHAT THEY DISPLACE, and a link whose name
 * holds a percent sign opens. Both replaced the canvas with nothing said, and
 * the link threw on the percent sign.
 */
kase('import', async () => {
  const page = await openBuilder();
  try {
    /* Work on the canvas that a file is about to replace. */
    await page.evaluate(`(async () => {
      const m = await import('/src/trackbuilder/model.js');
      const app = window.trackBuilder;
      app.loadDocument(m.createTrack('My work', 'micro'), '');
      app.arm('gate');
      app.placeAt({ x: 4, y: 5, z: 0 });
      app.placeAt({ x: 6, y: 5, z: 0 });
      app.disarm();
      return 1;
    })()`);
    const before = await page.evaluate('window.trackBuilder.doc.elements.length');
    await page.evaluate(`(async () => {
      const { PRESETS } = await import('/src/trackbuilder/presets.js');
      const inc = JSON.parse(JSON.stringify(PRESETS.find((p) => p.id === 'racegow5-track2')));
      inc.id = 'trk-11112222';
      inc.name = 'Incoming';
      await window.trackBuilder.importFile(new File([JSON.stringify(inc)], 'incoming.json', { type: 'application/json' }));
      return 1;
    })()`);
    const result = JSON.parse(await page.evaluate(`(async () => {
      const st = await import('/src/trackbuilder/storage.js');
      return JSON.stringify({
        name: window.trackBuilder.doc.name,
        library: st.listTracks('micro').map((t) => t.name),
        toast: document.getElementById('tb-toast').textContent,
      });
    })()`));
    check('an imported track opens', result.name === 'Incoming', result.name);
    check('and the work it replaced is in Load', before === 2 && result.library.includes('My work'), `${before} elements, Load holds ${ownTracks(result.library)}`);
    check('and the toast says so', /My work/.test(result.toast) && /Load/.test(result.toast), result.toast);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

kase('link', async () => {
  const page = await openBuilder();
  try {
    /* Work on the canvas, flushed to its autosave, then a link opened over it. */
    const url = JSON.parse(await page.evaluate(`(async () => {
      const m = await import('/src/trackbuilder/model.js');
      const app = window.trackBuilder;
      app.loadDocument(m.createTrack('Link work', 'micro'), '');
      app.arm('gate');
      app.placeAt({ x: 5, y: 6, z: 0 });
      app.disarm();
      app.autosaver.flush();
      const linked = m.createTrack('100% linked', 'micro');
      const el = m.createElement(linked, 'gate', { x: 5, y: 6, z: 0 }, 0);
      linked.elements.push(el);
      return JSON.stringify(location.origin + '/src/trackbuilder/index.html?class=micro&track=' + encodeURIComponent(m.serialize(linked)));
    })()`));
    await page.cdp.send('Page.navigate', { url }, page.sessionId);
    await page.until("!!(window.trackBuilder && window.trackBuilder.doc && window.trackBuilder.doc.name === '100% linked')", 15000);
    const result = JSON.parse(await page.evaluate(`(async () => {
      const st = await import('/src/trackbuilder/storage.js');
      return JSON.stringify({
        name: window.trackBuilder.doc.name,
        library: st.listTracks('micro').map((t) => t.name),
        toast: document.getElementById('tb-toast').textContent,
      });
    })()`));
    check('a ?track= link whose name holds a percent sign opens', result.name === '100% linked', result.name);
    check('and the work it replaced is in Load', result.library.includes('Link work'), `Load holds ${ownTracks(result.library)}`);
    check('and the toast says so', /Link work/.test(result.toast), result.toast);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* ------------------------------------------------------------------ */

async function main() {
  console.log(`builder flow check${rootArg ? ` (against ${root})` : ''}\n`);
  for (const [name, fn] of CASES) {
    if (only && name !== only) {
      continue;
    }
    console.log(name);
    try {
      await fn();
    } catch (e) {
      check(`${name} ran to the end`, false, e.message);
    }
  }
  if (failures.length) {
    console.log(`\nFAIL, ${failures.length}:`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('\nPASS');
  return 0;
}

process.exit(await main());
