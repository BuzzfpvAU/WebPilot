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

import { openPage, keyInfo } from '../tests/lib/page.js';
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

/*
 * A whoop canvas opens in the room once Three.js has arrived, by itself, so a
 * case that starts on the plan has to wait for that or the canvas changes under
 * it. `room: false` is for a page where the room is not expected to come.
 */
async function openBuilder(query = '?class=micro', width = 1600, height = 900, { room = true, block = false, touch = false } = {}) {
  const page = await openPage({ root, width, height, url: `/src/trackbuilder/index.html${query}`, block, touch });
  await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
  if (room && /class=micro/.test(query)) {
    /* Not fatal when it never comes: a checkout from before the room opened by
     * itself (which is how a case is shown to fail before its fix) has no room to
     * wait for, and what a case then finds is its own business. */
    await page.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer", 20000).catch(() => {});
    await page.sleep(300);
  }
  return page;
}

/* Load also lists the shipped tracks, which is noise in a line that is about
 * what somebody's own work turned into. */
const ownTracks = (names) => names.filter((n) => !/^RaceGOW/.test(n)).map((n) => `"${n}"`).join(', ') || 'none of it';

const json = async (page, expression) => JSON.parse(await page.evaluate(`JSON.stringify(${expression})`));

/* A real mouse click: the pointer moves there, presses and lets go, which is
 * three pointer events in the page, the same as a hand. */
async function mouse(page, type, x, y, buttons, mods = 0) {
  await page.cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers: mods,
  }, page.sessionId);
}

async function click(page, x, y) {
  await mouse(page, 'mouseMoved', x, y, 0);
  await mouse(page, 'mousePressed', x, y, 1);
  await page.sleep(50);
  await mouse(page, 'mouseReleased', x, y, 0);
  await page.sleep(80);
}

/* Press here, pull through `steps` intermediate points to there, and let go,
 * or stop short of letting go (`hold`) so the page can be looked at mid gesture.
 * `mods` is the modifier mask the protocol wants: Alt 1, Ctrl 2, Meta 4, Shift 8. */
async function drag(page, from, to, { steps = 8, hold = false, mods = 0, button = 'left' } = {}) {
  const send = (type, x, y, buttons) => page.cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers: mods,
  }, page.sessionId);
  const held = button === 'left' ? 1 : 2;
  await send('mouseMoved', from.x, from.y, 0);
  await send('mousePressed', from.x, from.y, held);
  for (let i = 1; i <= steps; i += 1) {
    await send('mouseMoved', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, held);
    await page.sleep(25);
  }
  if (!hold) {
    await send('mouseReleased', to.x, to.y, 0);
    await page.sleep(120);
  }
}

async function release(page, at) {
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1 }, page.sessionId);
  await page.sleep(120);
}

/*
 * Fingers. Real touch events over the protocol, which the browser turns into
 * pointer events with pointerType touch, the same as a screen does. A touch
 * event carries every finger that is down, so a finger is named by an id and
 * the caller says where each one is at each step.
 */
async function touch(page, type, fingers) {
  await page.cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: fingers.map((f) => ({ x: f.x, y: f.y, id: f.id })),
  }, page.sessionId);
}
const at1 = (p) => [{ id: 1, x: p.x, y: p.y }];

async function tap(page, p) {
  await touch(page, 'touchStart', at1(p));
  await page.sleep(60);
  await touch(page, 'touchEnd', []);
  await page.sleep(140);
}

/* One finger down here, pulled to there through `steps` points, and up, or
 * (`hold`) left down so the page can be looked at mid gesture. */
async function swipe(page, from, to, { steps = 8, hold = false } = {}) {
  await touch(page, 'touchStart', at1(from));
  for (let i = 1; i <= steps; i += 1) {
    await touch(page, 'touchMove', at1({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }));
    await page.sleep(25);
  }
  if (!hold) {
    await touch(page, 'touchEnd', []);
    await page.sleep(140);
  }
}

/* Two fingers, each carried from where it is to where it goes, together. */
async function pair(page, from, to, { steps = 8, hold = false } = {}) {
  const at = (i) => [
    { id: 1, x: from[0].x + ((to[0].x - from[0].x) * i) / steps, y: from[0].y + ((to[0].y - from[0].y) * i) / steps },
    { id: 2, x: from[1].x + ((to[1].x - from[1].x) * i) / steps, y: from[1].y + ((to[1].y - from[1].y) * i) / steps },
  ];
  await touch(page, 'touchStart', [at(0)[0]]);
  await touch(page, 'touchStart', at(0));
  for (let i = 1; i <= steps; i += 1) {
    await touch(page, 'touchMove', at(i));
    await page.sleep(25);
  }
  if (!hold) {
    await touch(page, 'touchEnd', []);
    await page.sleep(160);
  }
}

/* A key with modifiers, which the helper's own tap() has no way to send. */
async function key(page, code, mods = 0) {
  const info = keyInfo(code);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info, modifiers: mods }, page.sessionId);
  await page.sleep(30);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info, modifiers: mods }, page.sessionId);
  await page.sleep(80);
}

/* A palette tool, by the words on its button, pressed with the mouse. */
async function tool(page, label) {
  const at = await json(page, `(() => {
    const b = [...document.querySelectorAll('#tb-palette .tb-tool')].find((x) => x.querySelector('.tb-tool-label')?.textContent === ${JSON.stringify(label)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!at) {
    throw new Error(`no tool called ${label}`);
  }
  await click(page, at.x, at.y);
}

/* Every toast the page raises, kept, because a toast is on screen for four
 * seconds and gone after, and a check that looked afterwards would miss it. */
async function trapToasts(page) {
  await page.evaluate(`(() => {
    const app = window.trackBuilder;
    window.__toasts = [];
    const say = app.toast.bind(app);
    app.toast = (m) => { window.__toasts.push(m); say(m); };
    return 1;
  })()`);
}

const toasts = (page) => json(page, 'window.__toasts');
const undoCount = (page) => page.evaluate('window.trackBuilder.history.past.length');
const elements = (page) => json(page, 'window.trackBuilder.doc.elements.map((e) => ({ id: e.id, type: e.type, x: e.position.x, y: e.position.y, z: e.position.z, yaw: e.yaw, pinned: e.yawOverridden }))');

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
  const across = (right - left) / (box.r - box.l);
  const tall = (bottom - top) / (box.b - box.t);
  return {
    across,
    tall,
    /* How much of the picture the track takes in its larger direction: a small
     * track in a wide window fills its height and little of its width. */
    fill: Math.max(across, tall),
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
    check('a whoop track loaded on the plan fills at least a third of the picture in its larger direction', plan.fill >= 0.35, `${(plan.fill * 100).toFixed(0)} percent`);
    /* The track was loaded while the plan was showing, so the room's canvas
     * had no size to frame for. Going to it must not leave it framed for a
     * canvas that was not there: no Fit here, on purpose. */
    await inThreeD(page);
    const flipped = await measureExtent(page, 'view3d');
    check('a track loaded on the plan, then seen in the room, is framed there without asking', flipped.fill >= 0.35 && flipped.inside, `${(flipped.fill * 100).toFixed(0)} percent, inside ${flipped.inside}`);
    await page.evaluate('window.trackBuilder.frameAll(), 1');
    await page.sleep(300);
    const room = await measureExtent(page, 'view3d');
    check('and Fit in the room fills as much, all of it in view', room.fill >= 0.35 && room.inside, `${(room.fill * 100).toFixed(0)} percent, inside ${room.inside}`);
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
    check('in a narrow window the whole track is in view in the room', m.inside && m.fill >= 0.35, `${(m.fill * 100).toFixed(0)} percent of a picture ${m.wide} px across, inside ${m.inside}`);
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
    /* And a centimetre or two outside the side pipe, level with the middle of the
     * gate, where there is neither pipe nor pane: 26.7 mm of PVC is a few pixels
     * from here, and the pipe is picked by a fatter one that is never drawn. (Not
     * above the top pipe: the number hangs there.) */
    let near = 0;
    const onFloor = gates.filter((g) => g.z < 0.4);
    for (const g of onFloor) {
      await page.evaluate('window.trackBuilder.setSelection([]), 1');
      const yaw = await page.evaluate(`window.trackBuilder.doc.elements.find((e) => e.id === '${g.id}').yaw`);
      const out = 0.3556 + 0.0267 + 0.015;
      const beside = await screenOf(page, 'view3d', g.x - out * Math.sin(yaw), g.y + out * Math.cos(yaw), 0.36);
      if (beside) {
        await click(page, beside.x, beside.y);
        if (await page.evaluate(`window.trackBuilder.selection.has('${g.id}')`)) {
          near += 1;
        }
      }
    }
    check('and so does a click a centimetre or two outside the side pipe, of the gates on the floor', onFloor.length > 0 && near === onFloor.length, `${near} of ${onFloor.length}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A NUMBER DOES NOT COVER THE GATE IT NAMES. A whoop's order numbers were 0.33 m
 * tall over a gate 0.71 m across, so at the distance that shows a whole track
 * they were the gates. They are buttons over the canvas now, one size on the
 * screen at any distance, hung above the opening they belong to; what this
 * holds is the promise, and not how it is kept: every number is clear of the
 * opening of its own gate, seen from where a pilot stands.
 */
kase('labels', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await inThreeD(page);
    await page.sleep(300);
    const gates = await json(page, `window.trackBuilder.doc.elements.filter((e) => e.type === 'gate' && e.dims.sillH === 0).map((e) => ({ id: e.id, x: e.position.x, y: e.position.y, h: e.dims.clearH }))`);
    const bubbles = await json(page, `[...document.querySelectorAll('.tb-bubble')].map((b) => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, cx: r.left + r.width / 2 }; })`);
    check('the numbers are there, one for each pass', bubbles.length >= gates.length && bubbles.length > 0, `${bubbles.length} numbers`);
    check('and each is about 22 px, whatever the distance', bubbles.every((b) => Math.abs(b.height - 22) < 1), bubbles.map((b) => b.height).join(', '));
    let covered = 0;
    for (const g of gates) {
      const top = await screenOf(page, 'view3d', g.x, g.y, g.h);
      const mine = bubbles.filter((b) => Math.abs(b.cx - top.x) < 20);
      if (mine.length && mine.every((b) => b.bottom > top.y + 3)) {
        covered += 1;
      }
    }
    check('no number sits down in the opening of its own gate', covered === 0, `${covered} of ${gates.length} gates have one in the opening`);
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

/*
 * BUILD A TRACK IN THE ROOM WITH THE POINTER ALONE, which is what the tool is
 * for and what no earlier check could do: a person who has never seen it is
 * handed a picture of a layout and puts it on the floor. The layout is the
 * structures on the ground of RaceGOW5 Track 1 (three gates, a pole and two
 * horizontal poles), placed at positions projected onto the screen and clicked
 * there, one click each. Then the third gate is turned by the ring at its foot,
 * because the rule for where a new gate faces cannot know that this one is
 * flown from the side.
 *
 * What it asserts is what the plan's acceptance says: every piece within an
 * inch of where it was meant to go, every gate on an axis, exactly one undo
 * step for each gesture and no more, no toast the author did not ask for, and
 * nothing in the console.
 */
kase('build', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    const want = [
      { label: 'Gate', x: 4.267, y: 5.677 },
      { label: 'Gate', x: 5.741, y: 6.414 },
      { label: 'Gate', x: 4.636, y: 6.782 },
      { label: 'Pole', x: 4.991, y: 6.782 },
      { label: 'Horizontal pole', x: 5.372, y: 6.782 },
      { label: 'Horizontal pole', x: 4.267, y: 6.414 },
    ];
    let gestures = 0;
    for (const w of want) {
      const armed = await page.evaluate('window.trackBuilder.armed');
      const type = { Gate: 'gate', Pole: 'pole', 'Horizontal pole': 'horizontalPole' }[w.label];
      if (armed !== type) {
        await tool(page, w.label);
      }
      const at = await screenOf(page, 'view3d', w.x, w.y, 0);
      await click(page, at.x, at.y);
      gestures += 1;
      await page.until('!window.trackBuilder.view3d.dirty', 10000);
    }
    check('six clicks are six undo steps', (await undoCount(page)) === gestures, `${await undoCount(page)} steps for ${gestures} clicks`);

    const placed = await elements(page);
    const off = want.map((w, i) => Math.hypot((placed[i]?.x ?? 99) - w.x, (placed[i]?.y ?? 99) - w.y));
    check('every piece is within an inch of where it was meant to go', placed.length === want.length && off.every((d) => d < 0.03),
      off.map((d) => `${(d * 39.37).toFixed(2)} in`).join(', '));

    const gates = placed.filter((e) => e.type === 'gate');
    const quarter = (yaw) => Math.abs(Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2) - yaw) < 1e-5;
    check('every gate faces along an axis, which nobody had to arrange', gates.every((g) => quarter(g.yaw)),
      gates.map((g) => `${(g.yaw * 180 / Math.PI).toFixed(0)}`).join(', '));

    /* The third gate, turned by the ring: press the knob and pull it round to
     * the north of the gate. The tool is put away first, with the key the
     * plan names for it, or a click on the gate would place another piece. */
    await key(page, 'Escape');
    check('Escape puts the tool away', (await page.evaluate('window.trackBuilder.armed')) === null);
    await page.sleep(200);
    const g3 = gates[2];
    const gateMid = await screenOf(page, 'view3d', g3.x, g3.y, 0.355);
    await click(page, gateMid.x, gateMid.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const ring = await json(page, `(() => { const g = window.trackBuilder.doc.elements.find((e) => e.id === '${g3.id}'); return g.dims.clearW / 2 + 0.32; })()`);
    const knob = await screenOf(page, 'view3d', g3.x + Math.cos(g3.yaw) * ring, g3.y + Math.sin(g3.yaw) * ring, 0.05);
    const north = await screenOf(page, 'view3d', g3.x, g3.y + ring, 0);
    const before = await undoCount(page);
    await drag(page, knob, north, { steps: 10 });
    const after = (await elements(page)).find((e) => e.id === g3.id);
    check('pulling the knob on the ring turns the gate to face north', Math.abs(after.yaw - Math.PI / 2) < 1e-3, `${(after.yaw * 180 / Math.PI).toFixed(1)} degrees`);
    check('and that was one undo step', (await undoCount(page)) === before + 1, `${before} then ${await undoCount(page)}`);

    const bad = await json(page, `window.trackBuilder.warnings.filter((w) => w.id === 'rg-square-headings').map((w) => w.message)`);
    check('so the gates fail no RaceGOW rule about headings', bad.length === 0, bad.join(' | '));
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A DRAG MOVES THE PIECES, NOT THE SCENE. Measured, a whole rebuild of the room
 * is 8 to 53 ms of CPU, against a 16.7 ms frame, so a gate pulled across a 34
 * element track moves its own group and redraws the line and the scene is
 * rebuilt once, when it is let go. This holds the two halves of that promise:
 * nothing rebuilt while the pointer is down, and what is on the screen then
 * the same as a rebuild would draw, mesh for mesh.
 */
const SCENE = `(() => {
  const v = window.trackBuilder.view3d;
  v.root.updateMatrixWorld(true);
  const round = (n) => Math.round(n * 1e4) / 1e4;
  const out = [];
  v.content.traverse((o) => {
    if (!o.isMesh && !o.isLine) return;
    let shape = '';
    if (o.isLine) {
      const a = o.geometry.getAttribute('position').array;
      shape = a.length + ':' + Array.from(a).map(round).join(',');
    }
    out.push([o.geometry.type, o.userData.elementId || '', o.material.color ? o.material.color.getHex() : '', round(o.material.opacity ?? 1), o.matrixWorld.elements.map(round).join(','), shape].join('|'));
  });
  return out.sort();
})()`;

kase('drag', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track6');
    await page.until('!window.trackBuilder.view3d.dirty', 15000);
    await page.evaluate(`(() => { const v = window.trackBuilder.view3d; window.__builds = 0; const b = v.build.bind(v); v.build = () => { window.__builds += 1; b(); }; return 1; })()`);
    const els = await elements(page);
    check('the track is the 34 element one', els.length >= 30, `${els.length} elements`);
    /* A gate standing alone on the floor, well inside the room. */
    const g = els.find((e) => e.type === 'gate' && e.z === 0);
    const from = await screenOf(page, 'view3d', g.x, g.y, 0.355);
    const to = await screenOf(page, 'view3d', g.x + 0.5, g.y - 0.3, 0.355);
    const before = await undoCount(page);
    /* The press selects the gate, which redraws it as selected: that is the one
     * rebuild that belongs to the press. Everything after it is the drag. */
    await mouse(page, 'mouseMoved', from.x, from.y, 0);
    await mouse(page, 'mousePressed', from.x, from.y, 1);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const builds = await page.evaluate('window.__builds');
    for (let i = 1; i <= 12; i += 1) {
      await mouse(page, 'mouseMoved', from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12, 1);
      await page.sleep(25);
    }
    check('nothing is rebuilt while the pointer is down', (await page.evaluate('window.__builds')) === builds, `${await page.evaluate('window.__builds')} builds against ${builds}`);
    const fast = await json(page, SCENE);
    await page.evaluate('window.trackBuilder.view3d.build(), 1');
    const rebuilt = await json(page, SCENE);
    check('and what is on the screen is what a rebuild draws, mesh for mesh',
      JSON.stringify(fast) === JSON.stringify(rebuilt), `${fast.length} meshes against ${rebuilt.length}`);
    await release(page, to);
    const moved = (await elements(page)).find((e) => e.id === g.id);
    check('let go, the gate is where the pointer put it, to the inch',
      Math.abs(moved.x - (g.x + 0.5)) < 0.04 && Math.abs(moved.y - (g.y - 0.3)) < 0.04, `${(moved.x - g.x).toFixed(3)}, ${(moved.y - g.y).toFixed(3)}`);
    check('as one undo step', (await undoCount(page)) === before + 1, `${before} then ${await undoCount(page)}`);
    check('and the scene was rebuilt once, on release', (await page.evaluate('window.__builds')) > builds);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* Three gates in a row on the floor, placed through the host the way a click
 * places them (the click itself is what the build case checks), for the cases
 * that are about what happens to a track once it is there. */
async function threeGates(page) {
  await page.evaluate(`(() => {
    const app = window.trackBuilder;
    app.arm('gate');
    for (const [x, y] of [[4.5, 5.5], [5.5, 5.5], [5.5, 6.75]]) app.placeAt({ x, y, z: 0 });
    app.disarm();
    app.setSelection([]);
    return 1;
  })()`);
  await page.until('!window.trackBuilder.view3d.dirty', 10000);
}

const gateAt = async (page, i, z = 0.355) => {
  const g = (await elements(page)).filter((e) => e.type === 'gate')[i];
  return { g, at: await screenOf(page, 'view3d', g.x, g.y, z) };
};

/*
 * THE CAMERA IS NOT AN EDIT, AND EMPTY FLOOR IS NOT A GATE. A drag on empty
 * floor orbits, a click there lets go of what was selected, Shift drags a box,
 * and right click puts a tool away. None of them may leave an undo step.
 */
kase('camera and selection', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    const steps = await undoCount(page);
    const one = await gateAt(page, 0);
    await click(page, one.at.x, one.at.y);
    check('a click in the middle of a gate selects it', await page.evaluate(`window.trackBuilder.selection.has('${one.g.id}')`));
    const floor = await screenOf(page, 'view3d', 7.5, 4.2, 0);
    await click(page, floor.x, floor.y);
    check('a click on empty floor lets go of it', (await page.evaluate('window.trackBuilder.selection.size')) === 0);

    const theta = await page.evaluate('window.trackBuilder.view3d.orbit.theta');
    await drag(page, floor, { x: floor.x + 120, y: floor.y + 20 }, { steps: 8 });
    check('a drag on empty floor orbits the camera', Math.abs((await page.evaluate('window.trackBuilder.view3d.orbit.theta')) - theta) > 0.3);
    const target = await json(page, 'window.trackBuilder.view3d.orbit.target');
    await drag(page, floor, { x: floor.x - 80, y: floor.y - 40 }, { steps: 6, button: 'right' });
    const moved = await json(page, 'window.trackBuilder.view3d.orbit.target');
    check('a right drag pans it', Math.hypot(moved.x - target.x, moved.z - target.z) > 0.1);
    const radius = await page.evaluate('window.trackBuilder.view3d.orbit.radius');
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: floor.x, y: floor.y, deltaX: 0, deltaY: -240 }, page.sessionId);
    await page.sleep(200);
    check('the wheel zooms in', (await page.evaluate('window.trackBuilder.view3d.orbit.radius')) < radius);

    const a = await gateAt(page, 0);
    const c = await gateAt(page, 2);
    const pad = 60;
    const topLeft = { x: Math.min(a.at.x, c.at.x) - pad, y: Math.min(a.at.y, c.at.y) - pad };
    const bottomRight = { x: Math.max(a.at.x, c.at.x) + pad, y: Math.max(a.at.y, c.at.y) + pad };
    await drag(page, topLeft, bottomRight, { steps: 8, mods: 8 });
    const picked = await json(page, '[...window.trackBuilder.selection]');
    check('a Shift drag draws a box and selects what is in it', picked.includes(a.g.id) && picked.includes(c.g.id), picked.join(', '));

    await key(page, 'KeyA', 2);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const lit = () => page.evaluate("document.querySelectorAll('.tb-bubble.on').length");
    check('Control A selects every gate, and the room shows it', (await lit()) === 3, `${await lit()} numbers lit`);
    await key(page, 'Escape');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('and Escape lets go, and the room shows that', (await lit()) === 0, `${await lit()} numbers lit`);
    await tool(page, 'Gate');
    check('a tool is armed by its button', (await page.evaluate('window.trackBuilder.armed')) === 'gate');
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: floor.x, y: floor.y, button: 'right', buttons: 2, clickCount: 1 }, page.sessionId);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: floor.x, y: floor.y, button: 'right', buttons: 0, clickCount: 1 }, page.sessionId);
    await page.sleep(100);
    check('a right click puts it away', (await page.evaluate('window.trackBuilder.armed')) === null);
    check('and none of that left an undo step', (await undoCount(page)) === steps, `${steps} then ${await undoCount(page)}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE KEYS. Arrows nudge a grid square (six inches with Shift), Q and E turn a
 * quarter, X reverses the direction, Control D copies beside the gate, Delete
 * removes it, Control Z takes each of them back. One press is one undo step.
 */
kase('keys', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    await trapToasts(page);
    const two = await gateAt(page, 1);
    await click(page, two.at.x, two.at.y);
    const step = async (name, act, expect) => {
      const before = await undoCount(page);
      await act();
      const now = await undoCount(page);
      check(name, now === before + 1 && (await expect()), `${before} then ${now}`);
    };
    const pos = async () => (await elements(page)).filter((e) => e.type === 'gate')[1];

    const p0 = await pos();
    await step('an arrow key moves the selection one grid square, along one axis', () => key(page, 'ArrowUp'), async () => {
      const p = await pos();
      const d = Math.hypot(p.x - p0.x, p.y - p0.y);
      return Math.abs(d - 0.0254) < 1e-4 && (Math.abs(p.x - p0.x) < 1e-6 || Math.abs(p.y - p0.y) < 1e-6);
    });
    const p1 = await pos();
    await step('and with Shift six inches', () => key(page, 'ArrowLeft', 8), async () => {
      const p = await pos();
      return Math.abs(Math.hypot(p.x - p1.x, p.y - p1.y) - 6 * 0.0254) < 1e-4;
    });
    const yaw0 = (await pos()).yaw;
    await step('Q turns it a quarter', () => key(page, 'KeyQ'), async () => Math.abs(Math.abs((await pos()).yaw - yaw0) - Math.PI / 2) < 1e-4);
    await step('and E turns it back', () => key(page, 'KeyE'), async () => Math.abs((await pos()).yaw - yaw0) < 1e-4);
    const entry0 = await page.evaluate('window.trackBuilder.doc.sequence[1].entry');
    await step('X reverses the direction it is flown', () => key(page, 'KeyX'), async () => (await page.evaluate('window.trackBuilder.doc.sequence[1].entry')) === -entry0);

    const count = (await elements(page)).length;
    await step('Control D makes a copy', () => key(page, 'KeyD', 2), async () => (await elements(page)).length === count + 1);
    const all = await elements(page);
    const copy = all[all.length - 1];
    const orig = all[1];
    check('30 in along the width of the gate it copied', Math.abs(Math.hypot(copy.x - orig.x, copy.y - orig.y) - 30 * 0.0254) < 1e-3,
      `${(Math.hypot(copy.x - orig.x, copy.y - orig.y) / 0.0254).toFixed(1)} in`);
    check('the copy is what is selected, and is last in the flying order',
      await page.evaluate(`window.trackBuilder.selection.has('${copy.id}') && window.trackBuilder.selection.size === 1 && window.trackBuilder.doc.sequence.at(-1).elementId === '${copy.id}'`));
    await step('Delete removes it', () => key(page, 'Delete'), async () => (await elements(page)).length === count);
    const before = await undoCount(page);
    await key(page, 'KeyZ', 2);
    await key(page, 'KeyZ', 2);
    check('Control Z twice takes back the delete and then the copy', (await undoCount(page)) === before - 2 && (await elements(page)).length === count,
      `${before} then ${await undoCount(page)}, ${(await elements(page)).length} elements from ${count}`);
    await key(page, 'KeyZ', 2 | 8);
    check('and Control Shift Z puts the copy back', (await undoCount(page)) === before - 1 && (await elements(page)).length === count + 1,
      `${(await elements(page)).length} elements`);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE NUMBER ON A GATE IS A BUTTON. Click it, type where that gate should come
 * in the order, press Enter: it goes there, and the numbers close up. That is
 * one undo step, and Escape leaves it alone.
 */
kase('numbers', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    const bubbles = () => json(page, `[...document.querySelectorAll('.tb-bubble')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })`);
    let b = await bubbles();
    check('every gate has its number over it', b.length === 3 && b.map((x) => x.text).join() === '1,2,3', b.map((x) => x.text).join());
    check('about 22 px across, at any distance', b.every((x) => Math.abs(x.w - 22) < 1 && Math.abs(x.h - 22) < 1), b.map((x) => `${x.w}x${x.h}`).join());
    const order = () => json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)');
    const first = await order();
    const steps = await undoCount(page);

    await click(page, b[2].x, b[2].y);
    await page.until("!!document.querySelector('.tb-bubble-input')", 5000);
    await page.evaluate("(() => { const i = document.querySelector('.tb-bubble-input'); i.value = '1'; return 1; })()");
    await key(page, 'Enter');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const now = await order();
    check('typing 1 into the number on the third gate makes it the first', now[0] === first[2] && now[1] === first[0] && now[2] === first[1], now.join());
    check('as one undo step', (await undoCount(page)) === steps + 1);
    b = await bubbles();
    check('and the numbers close up, one of each', b.map((x) => x.text).sort().join() === '1,2,3', b.map((x) => x.text).join());

    await click(page, b[0].x, b[0].y);
    await page.until("!!document.querySelector('.tb-bubble-input')", 5000);
    await page.evaluate("(() => { const i = document.querySelector('.tb-bubble-input'); i.value = '3'; return 1; })()");
    await key(page, 'Escape');
    check('Escape leaves the order alone', (await order()).join() === now.join() && (await undoCount(page)) === steps + 1);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE RACING LINE RUNS THROUGH THE MIDDLE OF EVERY GATE, so with the line on
 * and able to take a press, a click in a gate's opening was a click on the line
 * (and started a bend). Bend line is off by default now: the gate takes the
 * click and the line is only a picture. Turned on, a drag that starts on the
 * line drops a waypoint on it, as it always did.
 */
kase('bend line', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    check('the line is on by default on a whoop canvas', await page.evaluate('window.trackBuilder.pathVisible === true'));
    check('and Bend line is off', await page.evaluate('window.trackBuilder.bendLine === false'));
    /*
     * A spot on the line with nothing in front of it, seen from where the
     * camera is now (a gate in front of the line takes the press, which is
     * right, and is not what is being asked here). The view is asked which
     * samples are clear only to CHOOSE the spot; the press is a real one.
     */
    const freeSpot = () => json(page, `(() => {
      const v = window.trackBuilder.view3d;
      const r = v.canvas.getBoundingClientRect();
      v.applyCamera(); v.camera.updateMatrixWorld(true); v.root.updateMatrixWorld(true);
      const V = v.camera.position.constructor;
      const samples = window.trackBuilder.path.samples;
      for (let i = 0; i < samples.length; i += 2) {
        const q = new V(samples[i].pos.x, samples[i].pos.y, samples[i].pos.z);
        v.root.localToWorld(q); q.project(v.camera);
        const at = { clientX: r.left + ((q.x + 1) / 2) * r.width, clientY: r.top + ((1 - q.y) / 2) * r.height };
        if (at.clientX < r.left + 60 || at.clientX > r.right - 60 || at.clientY < r.top + 60 || at.clientY > r.bottom - 160) continue;
        if (!v.pickHit(at) && v.pathHit(at)) return { x: at.clientX, y: at.clientY };
      }
      return null;
    })()`);
    const at = await freeSpot();
    check('there is somewhere on the line with nothing in front of it', at !== null);
    const count = (await elements(page)).length;
    const steps = await undoCount(page);
    await drag(page, at, { x: at.x + 40, y: at.y - 40 }, { steps: 6 });
    check('a drag that starts on the line, with Bend line off, does not bend it', (await elements(page)).length === count && (await undoCount(page)) === steps);
    const gate = await gateAt(page, 0);
    await click(page, gate.at.x, gate.at.y);
    check('and a click in the middle of a gate, where the line runs, selects the gate', await page.evaluate(`window.trackBuilder.selection.has('${gate.g.id}')`));

    await page.evaluate("window.trackBuilder.toggleBendLine(), 1");
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const at2 = await freeSpot();
    await drag(page, at2, { x: at2.x + 50, y: at2.y - 50 }, { steps: 8 });
    const after = await elements(page);
    check('with Bend line on, the same drag drops a waypoint on the line', after.length === count + 1 && after.some((e) => e.type === 'waypoint'), `${after.length} elements from ${count}`);
    check('as one undo step', (await undoCount(page)) === steps + 1, `${steps} then ${await undoCount(page)}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE ROOM MAY NOT TAKE THE TOOL DOWN WITH IT. Three.js comes from a CDN, and
 * a network that cannot reach it must leave a builder that builds: view3d.js
 * says why the room is never load bearing, and a whoop canvas opening in the
 * room by itself is exactly where that promise is easiest to break. With every
 * request to the CDN refused, the canvas stays on the plan it has always had,
 * pressing Room says why it did nothing and stays on the plan, and a track can
 * still be laid out on it, with the same rule for where a gate faces.
 */
kase('three blocked', async () => {
  const page = await openBuilder('?class=micro', 1600, 900, { room: false, block: true });
  try {
    await page.sleep(3000);
    check('the canvas stays on the plan', (await page.evaluate('window.trackBuilder.mode')) === '2d');
    check('the palette and the plan are there, and nothing has thrown', (await page.evaluate("document.querySelectorAll('#tb-palette .tb-tool').length")) > 5 && ownErrors(page).length === 0, ownErrors(page).join(' | '));
    await trapToasts(page);
    const room = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-topbar button')].find((x) => x.textContent === 'Room'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, room.x, room.y);
    await page.until('window.__toasts.length > 0', 15000);
    check('pressing Room says why it did nothing', /could not load Three\.js/.test((await toasts(page))[0]), (await toasts(page))[0]);
    await page.until("window.trackBuilder.mode === '2d'", 5000);
    check('and leaves the plan up', (await page.evaluate('window.trackBuilder.mode')) === '2d');

    await tool(page, 'Gate');
    for (const [x, y] of [[4.5, 5.5], [5.5, 5.5], [5.5, 6.75]]) {
      const at = await screenOf(page, 'view2d', x, y);
      await click(page, at.x, at.y);
    }
    const placed = (await elements(page)).filter((e) => e.type === 'gate');
    check('three clicks on the plan place three gates, one undo step each', placed.length === 3 && (await undoCount(page)) === 3, `${placed.length} gates, ${await undoCount(page)} steps`);
    const quarter = (yaw) => Math.abs(Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2) - yaw) < 1e-5;
    check('each facing along an axis, as they do in the room', placed.every((g) => quarter(g.yaw)) && placed.every((g) => g.pinned), placed.map((g) => (g.yaw * 180 / Math.PI).toFixed(0)).join(', '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * ROOM, PLAN AND 2D. Room is the track in 3D from an angle, where it is built.
 * Plan is the same room from straight above, for measuring, and a camera and not
 * a second editor. 2D is the canvas this tool has always had, one press away.
 * V goes between the first two, Home fits the track, F frames what is selected.
 */
kase('views', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    const plan = () => page.evaluate('window.trackBuilder.view3d.isPlan()');
    const mode = () => page.evaluate('window.trackBuilder.mode');
    const lit = () => json(page, `(() => { const on = (t) => [...document.querySelectorAll('#tb-topbar button')].find((x) => x.textContent === t)?.classList.contains('on'); return { room: on('Room'), plan: on('Plan'), d2: on('2D') }; })()`);
    check('it opens in the room, seen from an angle', (await mode()) === '3d' && !(await plan()) && (await lit()).room === true);
    await key(page, 'KeyV');
    check('V goes to the plan, straight down, and the button says so', (await mode()) === '3d' && (await plan()) && (await lit()).plan === true);
    /* Off the middle, where the number hangs: from straight above a number sits
     * on its gate. */
    const g = await gateAt(page, 1);
    const along = await screenOf(page, 'view3d', g.g.x - 0.25 * Math.sin(g.g.yaw), g.g.y + 0.25 * Math.cos(g.g.yaw), 0.355);
    await click(page, along.x, along.y);
    check('a gate is picked in the plan the way it is in the room', await page.evaluate(`window.trackBuilder.selection.has('${g.g.id}')`));
    await key(page, 'KeyV');
    check('V again is the room', (await mode()) === '3d' && !(await plan()));

    const button = (label) => json(page, `(() => { const b = [...document.querySelectorAll('#tb-topbar button')].find((x) => x.textContent === ${JSON.stringify(label)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const two = await button('2D');
    await click(page, two.x, two.y);
    check('2D is the classic canvas, one press away', (await mode()) === '2d' && (await lit()).d2 === true);
    await key(page, 'KeyV');
    check('and V brings the room back', (await mode()) === '3d');

    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await key(page, 'Home');
    await page.sleep(300);
    const baseline = await measureExtent(page, 'view3d');
    const floor = await screenOf(page, 'view3d', 7.5, 4.2, 0);
    await drag(page, floor, { x: floor.x + 150, y: floor.y }, { steps: 6 });
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: floor.x, y: floor.y, deltaX: 0, deltaY: 900 }, page.sessionId);
    await page.sleep(300);
    await key(page, 'Home');
    await page.sleep(300);
    const fitted = await measureExtent(page, 'view3d');
    check('Home puts the whole track back in view, framed as it was, after the camera has gone', fitted.inside && Math.abs(fitted.fill - baseline.fill) < 0.04, `${(fitted.fill * 100).toFixed(0)} percent, and ${(baseline.fill * 100).toFixed(0)} before, inside ${fitted.inside}`);

    const one = await gateAt(page, 2);
    await click(page, one.at.x, one.at.y);
    const radius = await page.evaluate('window.trackBuilder.view3d.orbit.radius');
    await key(page, 'KeyF');
    await page.sleep(300);
    const after = await gateAt(page, 2);
    const rect = await json(page, 'window.trackBuilder.view3d.canvas.getBoundingClientRect().toJSON()');
    check('F closes in on what is selected', (await page.evaluate('window.trackBuilder.view3d.orbit.radius')) < radius, `${radius.toFixed(2)} then ${(await page.evaluate('window.trackBuilder.view3d.orbit.radius')).toFixed(2)}`);
    check('and puts it in the middle of the room', Math.abs(after.at.x - (rect.left + rect.width / 2)) < 30 && Math.abs(after.at.y - (rect.top + rect.height / 2)) < rect.height * 0.3,
      `${after.at.x.toFixed(0)}, ${after.at.y.toFixed(0)} in ${rect.width}x${rect.height}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE CARD BY THE SELECTED GATE holds the six things a pilot changes, in
 * inches, and a Copy, a Remove and a More. Typing in it is an edit like any
 * other: one undo step.
 */
kase('card', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    await trapToasts(page);
    check('nothing selected, no card', await page.evaluate("document.getElementById('tb-card').hidden"));
    const two = await gateAt(page, 1);
    await click(page, two.at.x, two.at.y);
    await page.until("!document.getElementById('tb-card').hidden", 5000);
    const labels = await json(page, `[...document.querySelectorAll('#tb-card .tb-field-label, #tb-card .tb-card-fig > span')].map((x) => x.textContent)`);
    check('the card has the six things the plan names', ['Place in order', 'X (in)', 'Y (in)', 'Height off floor (in)', 'Turn (degrees)', 'Direction'].every((l) => labels.includes(l)), labels.join(' | '));
    const buttons = await json(page, `[...document.querySelectorAll('#tb-card button')].map((x) => x.textContent)`);
    check('and Reverse, Copy, Remove and More', ['Reverse', 'Copy', 'Remove', 'More'].every((l) => buttons.includes(l)), buttons.join(' | '));
    const mm = await json(page, `[...document.querySelectorAll('#tb-card .tb-field-suffix')].map((x) => x.textContent)`);
    check('with the millimetres beside the inches', mm.length >= 3 && mm.every((t) => /mm$/.test(t)), mm.join(' | '));

    const type = async (key2, value) => {
      await page.evaluate(`(() => { const i = document.querySelector('#tb-card [data-tbkey^="${key2}"]'); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await page.sleep(150);
    };
    const gate = async () => (await elements(page)).filter((e) => e.type === 'gate')[1];
    let steps = await undoCount(page);
    await type('card-x-', 20);
    let now = await gate();
    check('typing 20 in X puts the gate 20 in east of the middle of the room', Math.abs(now.x - (5 + 20 * 0.0254)) < 1e-4 && (await undoCount(page)) === steps + 1, `${now.x}`);
    steps = await undoCount(page);
    await type('card-h-', 30);
    const sill = await page.evaluate(`window.trackBuilder.doc.elements.filter((e) => e.type === 'gate')[1].dims.sillH`);
    check('and 30 in of height off the floor lifts it 30 in', Math.abs(sill - 30 * 0.0254) < 1e-4 && (await undoCount(page)) === steps + 1, `${sill}`);
    steps = await undoCount(page);
    await type('card-turn-', 90);
    now = await gate();
    check('90 in Turn faces it north', Math.abs(now.yaw - Math.PI / 2) < 1e-4 && (await undoCount(page)) === steps + 1, `${now.yaw}`);
    steps = await undoCount(page);
    const before = await page.evaluate('window.trackBuilder.doc.sequence[1].entry');
    /* The card follows its piece, and the camera settles after an edit that moves the
     * piece, so what a press is aimed at is measured twice, a frame apart, until it
     * has stopped. */
    const where = (label) => json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const at = async (label) => {
      let last = await where(label);
      for (let i = 0; i < 20; i += 1) {
        await page.sleep(150);
        const now = await where(label);
        if (now && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) {
          return now;
        }
        last = now;
      }
      return last;
    };
    const rev = await at('Reverse');
    await click(page, rev.x, rev.y);
    check('Reverse turns the direction it is flown round', (await page.evaluate('window.trackBuilder.doc.sequence[1].entry')) === -before && (await undoCount(page)) === steps + 1);
    const more = await at('More');
    await click(page, more.x, more.y);
    check('More opens the drawer with everything else in it', await page.evaluate("document.body.classList.contains('tb-drawer')"));
    await page.evaluate('window.trackBuilder.toggleDrawer(false), 1');
    const copy = await at('Copy');
    const count = (await elements(page)).length;
    await click(page, copy.x, copy.y);
    check('Copy makes a copy beside it', (await elements(page)).length === count + 1);
    await page.until("!document.getElementById('tb-card').hidden", 5000);
    const remove = await at('Remove');
    await click(page, remove.x, remove.y);
    check('Remove takes it away, and the card with it', (await elements(page)).length === count && (await page.evaluate("document.getElementById('tb-card').hidden")));
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * AN EMPTY CANVAS SAYS WHAT TO DO. It is the hardest thing to start from, so
 * it says pick a gate and click the floor, and offers a finished RaceGOW track
 * to change instead. While the track is a few gates a line at the foot says what
 * the pointer does now, and it goes when there are three.
 */
kase('empty canvas', async () => {
  const page = await openBuilder();
  try {
    const empty = () => page.evaluate("!document.getElementById('tb-empty').hidden");
    const coach = () => page.evaluate("document.getElementById('tb-coach').hidden ? '' : document.getElementById('tb-coach').textContent");
    check('an empty whoop canvas says what to do', (await empty()) && /Pick a gate on the left, then click the floor/.test(await page.evaluate("document.getElementById('tb-empty').textContent")));
    const start = await json(page, `(() => { const b = document.querySelector('#tb-empty button'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent }; })()`);
    check('and offers a finished track to start from', start.text === 'Start from a RaceGOW track', start.text);
    await click(page, start.x, start.y);
    await page.until("!document.getElementById('tb-modal').hidden", 5000);
    const listed = await page.evaluate("document.getElementById('tb-modal').textContent");
    check('which opens the eight shipped ones in Load', (listed.match(/RaceGOW5 Track \d/g) || []).length >= 8, `${(listed.match(/RaceGOW5 Track \d/g) || []).length} of them`);
    await key(page, 'Escape');
    await page.until("document.getElementById('tb-modal').hidden", 5000);

    await tool(page, 'Gate');
    check('with a tool armed, the line at the foot says click the floor', /Click the floor/.test(await coach()), await coach());
    for (const [x, y] of [[5, 6], [5, 7.5]]) {
      const at = await screenOf(page, 'view3d', x, y, 0);
      await click(page, at.x, at.y);
    }
    check('the prompt goes with the first gate', !(await empty()));
    check('and the line at the foot is still there with two gates', (await coach()) !== '');
    const at = await screenOf(page, 'view3d', 5, 9, 0);
    await click(page, at.x, at.y);
    check('and gone with three', (await coach()) === '', await coach());
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A GHOST FOLLOWS THE POINTER, snapped, with the distance to the gate before it.
 * That is the promise of placing in the room: what a click would do is on the
 * screen before the click. The distance is in the units the rules are in, and
 * green when the pair would be a legal side by side pair.
 */
kase('ghost', async () => {
  const page = await openBuilder();
  try {
    await tool(page, 'Gate');
    const first = await screenOf(page, 'view3d', 5, 6, 0);
    await click(page, first.x, first.y);
    const ghost = () => page.evaluate('window.trackBuilder.view3d.ghostGroup !== null');
    const measures = () => json(page, `[...document.querySelectorAll('.tb-measure')].filter((n) => n.style.display !== 'none').map((n) => ({ text: n.textContent, cls: n.className }))`);
    const hover = async (x, y) => {
      const at = await screenOf(page, 'view3d', x, y, 0);
      await mouse(page, 'mouseMoved', at.x, at.y, 0);
      await page.sleep(400);
    };
    await hover(5, 6 + 30 * 0.0254);
    check('with a tool armed, a ghost follows the pointer', await ghost());
    let m = await measures();
    check('with the distance to the gate before it, in inches and millimetres', m.length === 1 && m[0].text === '30 in (762 mm)', JSON.stringify(m));
    check('green, because 30 in is a legal side by side pair', m.length === 1 && /tone-legal/.test(m[0].cls), JSON.stringify(m));
    await hover(5, 9);
    m = await measures();
    check('a gate 3 m on is a plain distance, not coloured', m.length === 1 && /tone-plain/.test(m[0].cls) && /\d+ in \(\d+ mm\)/.test(m[0].text), JSON.stringify(m));
    await hover(5, 6 + 20 * 0.0254);
    m = await measures();
    check('and one 20 in on is amber, too close to be another gate', m.length === 1 && /tone-close/.test(m[0].cls), JSON.stringify(m));
    const steps = await undoCount(page);
    check('hovering is not an edit', steps === 1, String(steps));
    await mouse(page, 'mouseMoved', 5, 5, 0);
    await page.sleep(300);
    check('the ghost goes when the pointer leaves the room', !(await ghost()) && (await measures()).length === 0);
    await hover(5, 6 + 30 * 0.0254);
    await key(page, 'Escape');
    check('and when the tool is put away', !(await ghost()) && (await measures()).length === 0);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A PIECE LANDS WHERE THE RULES SAY IT GOES. Near a legal spot the magnet takes
 * it there and shows a guide: 30 in centre to centre along the width of a gate is
 * a side by side pair, 14 in off a gate is where a pole stands. A gate that lands
 * beside another faces the way it does. Alt turns all of it off. What is asserted
 * is what the pilot sees: the distance beside the ghost reads exactly 30 in while
 * the pointer is a few centimetres off it, and what a click puts down is where
 * the ghost was.
 */
kase('magnets', async () => {
  const page = await openBuilder();
  try {
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 5, y: 6, z: 0 });
      app.placeAt({ x: 5, y: 7.5, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const measures = () => json(page, `[...document.querySelectorAll('.tb-measure')].filter((n) => n.style.display !== 'none').map((n) => n.textContent)`);
    const hover = async (x, y, mods = 0) => {
      const at = await screenOf(page, 'view3d', x, y, 0);
      await mouse(page, 'mouseMoved', at.x, at.y, 0, mods);
      await page.sleep(400);
      return at;
    };
    const steps = await undoCount(page);
    await tool(page, 'Gate');
    const slotX = 5 + 30 * 0.0254;

    await hover(slotX + 0.03, 6.02);
    check('a few centimetres from 30 in beside a gate, the ghost reads 30 in', (await measures()).includes('30 in (762 mm)'), (await measures()).join(' | '));
    check('and the guide is there', (await page.evaluate('window.trackBuilder.guides.length')) === 1 && (await page.evaluate('window.trackBuilder.view3d.guideGroup !== null')));
    await hover(slotX + 0.03, 6.02, 1);
    const free = await measures();
    check('with Alt held it does not: the distance is what it is, and there is no guide', !free.includes('30 in (762 mm)') && (await page.evaluate('window.trackBuilder.guides.length')) === 0, free.join(' | '));

    const at = await hover(slotX + 0.03, 6.02);
    await click(page, at.x, at.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const gates = (await elements(page)).filter((e) => e.type === 'gate');
    const beside = gates[2];
    check('the click puts the gate exactly there', Math.abs(beside.x - slotX) < 1e-3 && Math.abs(beside.y - 6) < 1e-3, `${beside.x}, ${beside.y}`);
    check('facing the way its neighbour faces, north', Math.abs(beside.yaw - Math.PI / 2) < 1e-4 && beside.pinned, `${beside.yaw}`);
    check('as one undo step', (await undoCount(page)) === steps + 1, `${steps} then ${await undoCount(page)}`);

    await tool(page, 'Pole');
    await hover(5 - 14 * 0.0254 - 0.02, 6.03);
    check('a pole a few centimetres from 14 in beside a gate is guided to 14 in', await page.evaluate('window.trackBuilder.guides.some((g) => g.kind === "pole" && g.text === "14 in")'));
    await key(page, 'Escape');

    /* Pulled away and back, a gate lands beside its neighbour again. */
    await key(page, 'Escape');
    const pulled = (await elements(page)).filter((e) => e.type === 'gate')[2];
    const from = await screenOf(page, 'view3d', pulled.x, pulled.y, 0.355);
    const away = await screenOf(page, 'view3d', pulled.x + 0.6, pulled.y + 0.35, 0.355);
    const backNear = await screenOf(page, 'view3d', slotX + 0.03, 6.02, 0.355);
    await drag(page, from, away, { steps: 8 });
    const moved = (await elements(page)).filter((e) => e.type === 'gate')[2];
    check('a gate pulled 0.6 m away is where it was pulled to, on the grid', Math.hypot(moved.x - pulled.x, moved.y - pulled.y) > 0.5);
    await drag(page, await screenOf(page, 'view3d', moved.x, moved.y, 0.355), backNear, { steps: 8 });
    const home = (await elements(page)).filter((e) => e.type === 'gate')[2];
    check('and pulled back near the spot it lands there again, exactly', Math.abs(home.x - slotX) < 1e-3 && Math.abs(home.y - 6) < 1e-3, `${home.x}, ${home.y}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A ROW IS ONE DRAG. Two or three gates side by side, 30 in apart, is the most
 * common thing on a RaceGOW course, and building it as three placements and a
 * heading each was the hardest part of the plan view. With the row tool a drag
 * along the floor lays them, faint, with the 30 in between them, before the
 * button is let go; a click lays a pair. The result is one undo step, gates that
 * are pinned to a heading, the shared upright built once, and nothing to warn about.
 */
kase('row', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await tool(page, 'Side by side');
    check('the tool is on the palette and armed', await page.evaluate("window.trackBuilder.armed === 'row'"));
    const a = await screenOf(page, 'view3d', 4, 6, 0);
    const b = await screenOf(page, 'view3d', 5.5, 6, 0);
    await drag(page, a, b, { steps: 10, hold: true });
    await page.sleep(300);
    const live = await json(page, `({
      ghosts: window.trackBuilder.view3d.ghostGroup ? window.trackBuilder.view3d.ghostGroup.children.length : 0,
      measures: [...document.querySelectorAll('.tb-measure')].filter((n) => n.style.display !== 'none').map((n) => n.textContent),
      placed: window.trackBuilder.doc.elements.length,
    })`);
    check('mid drag, the three gates are drawn faint and nothing is placed yet', live.ghosts === 3 && live.placed === 0, JSON.stringify(live));
    check('with the 30 in between each pair of them', live.measures.length === 2 && live.measures.every((m) => m === '30 in (762 mm)'), live.measures.join(' | '));
    await release(page, b);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const gates = (await elements(page)).filter((e) => e.type === 'gate');
    check('letting go lays them as one undo step', gates.length === 3 && (await undoCount(page)) === 1, `${gates.length} gates, ${await undoCount(page)} steps`);
    const spacing = gates.slice(1).map((g, i) => Math.hypot(g.x - gates[i].x, g.y - gates[i].y));
    check('30 in apart, centre to centre', spacing.every((d) => Math.abs(d - 0.762) < 1e-6), spacing.join(', '));
    check('all facing the same way, north with nothing before them, and pinned there', gates.every((g) => Math.abs(g.yaw - Math.PI / 2) < 1e-6 && g.pinned), gates.map((g) => g.yaw).join(', '));
    const unbuilt = await json(page, "window.trackBuilder.doc.elements.filter((e) => e.type === 'gate').map((e) => (e.unbuiltSides || []).length)");
    check('each gate after the first shares its upright with the one before, built once', unbuilt.join() === '0,1,1', unbuilt.join());
    const selected = await page.evaluate('window.trackBuilder.selection.size');
    check('the row is what is selected', selected === 3, String(selected));
    check('the ghost is gone', await page.evaluate('window.trackBuilder.view3d.ghostGroup === null'));
    /* What the track says about it is what is true of it: no rule about spacing,
     * pairs or poles is broken, the line is only short of a way from one gate to the
     * next (three gates side by side all flown north is a hairpin between each, which
     * is what waypoints are for), the track is not finished, and a row of three is
     * wider than the frame. Any other code here is a rule the row does not keep. */
    const warned = await json(page, 'window.trackBuilder.warnings.map((w) => ({ code: w.code, message: w.message }))');
    const unexpected = warned.filter((w) => !['tight-corner', 'rg-envelope', 'no-start'].includes(w.code));
    check('the row breaks no rule of the sport', unexpected.length === 0, unexpected.map((w) => w.message).join(' | ') || warned.map((w) => w.code).join(', '));

    /* A second row, south of the first, faces away from it: the course is heading south. */
    await page.evaluate('window.trackBuilder.view3d.zoomToward(800, 450, 3), 1');
    const a2 = await screenOf(page, 'view3d', 4, 3, 0);
    const b2 = await screenOf(page, 'view3d', 5.5, 3, 0);
    const room = await json(page, "(() => { const r = window.trackBuilder.view3d.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()");
    const inside = (p) => p && p.x > room.l && p.x < room.r && p.y > room.t && p.y < room.b;
    check('with the room pulled back, the spot for it is on the screen', inside(a2) && inside(b2), JSON.stringify([a2, b2, room]));
    await drag(page, a2, b2, { steps: 10 });
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const next = (await elements(page)).filter((e) => e.type === 'gate').slice(3);
    check('a row laid south of the last one faces south, the way the course is going', next.length === 3 && next.every((g) => Math.abs(g.yaw + Math.PI / 2) < 1e-6), next.map((g) => g.yaw).join(', '));
    check('as another single undo step', (await undoCount(page)) === 2, String(await undoCount(page)));

    /* A click without a drag lays a pair. */
    const at = await screenOf(page, 'view3d', 8, 6, 0);
    check('with the spot for it on the screen', inside(at), JSON.stringify([at, room]));
    await click(page, at.x, at.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const all = (await elements(page)).filter((e) => e.type === 'gate');
    check('a click lays a pair', all.length === 8 && (await undoCount(page)) === 3, `${all.length} gates, ${await undoCount(page)} steps`);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE RULER ANSWERS "HOW FAR" AND LEAVES NO MARK. Two clicks: the distance is
 * drawn on the floor between them and said in inches with the millimetres beside
 * it. A click near a piece takes its middle, since the question is nearly always
 * how far one gate is from another. The ruler is not part of the track: nothing
 * is stored, it is not an undo step, and putting the tool away takes it off.
 */
kase('ruler', async () => {
  const page = await openBuilder();
  try {
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.placeRow({ x: 4, y: 6, z: 0 }, { x: 5.5, y: 6, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const stored = await page.evaluate('JSON.stringify(window.trackBuilder.doc)');
    const steps = await undoCount(page);
    await tool(page, 'Ruler');
    check('the ruler is armed', await page.evaluate("window.trackBuilder.armed === 'ruler'"));
    const gates = (await elements(page)).filter((e) => e.type === 'gate');
    const first = await screenOf(page, 'view3d', gates[0].x + 0.03, gates[0].y - 0.02, 0);
    const last = await screenOf(page, 'view3d', gates[2].x - 0.03, gates[2].y + 0.02, 0);
    const label = () => json(page, `[...document.querySelectorAll('.tb-measure.tone-ruler')].filter((n) => n.style.display !== 'none').map((n) => n.textContent)`);
    await click(page, first.x, first.y);
    await mouse(page, 'mouseMoved', last.x, last.y, 0);
    await page.sleep(300);
    check('between the clicks the line follows the pointer and says how far', (await label()).join() === '60 in (1524 mm)', (await label()).join());
    await click(page, last.x, last.y);
    check('the second click holds it: from middle to middle of two gates 60 in apart', (await label()).join() === '60 in (1524 mm)', (await label()).join());
    check('and the line is in the room', await page.evaluate('window.trackBuilder.view3d.rulerGroup !== null'));
    await mouse(page, 'mouseMoved', last.x + 60, last.y + 40, 0);
    await page.sleep(200);
    check('a held ruler does not follow the pointer', (await label()).join() === '60 in (1524 mm)', (await label()).join());
    check('it is not an undo step', (await undoCount(page)) === steps, `${steps} then ${await undoCount(page)}`);
    check('and nothing about it is in the track', (await page.evaluate('JSON.stringify(window.trackBuilder.doc)')) === stored);
    await key(page, 'Escape');
    check('putting the tool away takes it off', (await label()).length === 0 && (await page.evaluate('window.trackBuilder.view3d.rulerGroup === null')));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * REPLACE WITH SWAPS WHAT A PIECE IS AND LEAVES WHERE IT IS. A gate that ought to
 * have been a stack is changed where it stands, from the card, and keeps its
 * number and its heading, so it does not have to be deleted, placed again and
 * renumbered. It is one undo step, and the card offers only what the piece can
 * become: a gate is not offered a pole.
 */
kase('replace with', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 4, y: 6, z: 0 });
      app.placeAt({ x: 5, y: 7, z: 0 });
      app.placeAt({ x: 6, y: 6, z: 0 });
      app.arm('pole');
      app.placeAt({ x: 7, y: 6.5, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const list = await elements(page);
    const middle = list.filter((e) => e.type === 'gate')[1];
    const before = await json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)');
    const at = await screenOf(page, 'view3d', middle.x + 0.16, middle.y, 0.35);
    await click(page, at.x, at.y);
    await page.until(`window.trackBuilder.selection.has('${middle.id}')`, 5000);
    const offered = () => json(page, `[...document.querySelectorAll('#tb-card [data-tbkey="card-replace"] option')].map((o) => o.value).filter(Boolean)`);
    check('a selected gate offers the other four openings, and not a pole', (await offered()).join() === 'doubleStack,ladder,tower,diveGate', (await offered()).join());
    const steps = await undoCount(page);
    const drawn = () => page.evaluate(`window.trackBuilder.view3d.pickables.filter((m) => m.userData.elementId === '${middle.id}').length`);
    const pieces = await drawn();
    const choose = async (value) => {
      await page.evaluate(`(() => {
        const s = document.querySelector('#tb-card [data-tbkey="card-replace"]');
        s.value = ${JSON.stringify(value)};
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
      })()`);
      await page.sleep(200);
      await page.until('!window.trackBuilder.view3d.dirty', 10000);
    };
    await choose('doubleStack');
    const now = (await elements(page)).find((e) => e.id === middle.id);
    check('choosing a double stack changes it where it stands', now.type === 'doubleStack' && Math.abs(now.x - middle.x) < 1e-9 && Math.abs(now.y - middle.y) < 1e-9 && Math.abs(now.yaw - middle.yaw) < 1e-9, JSON.stringify(now));
    check('in the same place in the flying order', (await json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)')).join() === before.join());
    check('as one undo step', (await undoCount(page)) === steps + 1, `${steps} then ${await undoCount(page)}`);
    check('the piece stays selected and the card now says what it is', await page.evaluate(`window.trackBuilder.selection.has('${middle.id}') && /Double stack/i.test(document.getElementById('tb-card').textContent)`), await page.evaluate("document.getElementById('tb-card').textContent.slice(0, 80)"));
    const stacked = await drawn();
    check('and the room draws it as a stack: more frame than the one gate had', pieces > 0 && stacked > pieces, `${pieces} pieces then ${stacked}`);
    check('it can be turned back into a gate from the card', (await offered()).includes('gate'));
    await choose('gate');
    check('and is a gate again, one more step', (await elements(page)).find((e) => e.id === middle.id).type === 'gate' && (await undoCount(page)) === steps + 2);
    await page.evaluate('window.trackBuilder.undo(), window.trackBuilder.undo(), 1');
    await page.sleep(200);
    check('undo takes it back, one step at a time', (await elements(page)).find((e) => e.id === middle.id).type === 'gate' && (await undoCount(page)) === steps);

    /* A pole offers a cone and nothing else, and a mixed selection offers nothing. */
    const pole = list.find((e) => e.type === 'pole');
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.id}']), 1`);
    await page.sleep(200);
    check('a pole offers a cone, and only that', (await offered()).join() === 'cone', (await offered()).join());
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.id}', '${middle.id}']), 1`);
    await page.sleep(200);
    check('a gate and a pole together offer nothing', (await offered()).length === 0 && (await page.evaluate("!document.getElementById('tb-card').hidden")));
    await page.evaluate(`window.trackBuilder.setSelection(['${middle.id}', '${list.filter((e) => e.type === 'gate')[0].id}']), 1`);
    await page.sleep(200);
    await choose('tower');
    const towers = (await elements(page)).filter((e) => e.type === 'tower').length;
    check('two gates selected are changed together, in one undo step', towers === 2 && (await undoCount(page)) === steps + 1, `${towers} towers, ${await undoCount(page)} steps`);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A WARNING IS ON THE PIECE IT IS ABOUT. The list of warnings in the drawer is
 * where a pilot has to go to find out what is wrong, and then has to find the gate
 * it means. A red mark sits by every piece that breaks a rule; the sentence is one
 * hover away, a click selects the piece and the card says it again in words, and
 * the mark goes the moment the rule is kept, even in the middle of a drag.
 */
kase('warnings on the piece', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 5, y: 6, z: 0 });
      app.placeAt({ x: 5 + 20 * 0.0254, y: 6, z: 0 });
      app.placeAt({ x: 7.5, y: 8, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await page.sleep(300);
    const badges = () => json(page, `[...document.querySelectorAll('.tb-warnbadge')].filter((n) => n.style.display !== 'none').map((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: n.getAttribute('aria-label') }; })`);
    const shown = await badges();
    check('two gates 20 in apart carry a mark each', shown.length === 2 && shown.every((b) => /20 in/.test(b.label)), JSON.stringify(shown.map((b) => b.label)));
    const gates = (await elements(page)).filter((e) => e.type === 'gate');
    const far = await screenOf(page, 'view3d', gates[2].x, gates[2].y, 0.8);
    check('and the gate that breaks nothing does not', shown.every((b) => Math.hypot(b.x - far.x, b.y - far.y) > 40), JSON.stringify([far, shown]));
    check('the notes the lap bar does not count are not marked: two warnings, not three', (await page.evaluate('window.trackBuilder.warnings.filter((w) => w.level === "info").length')) >= 1);

    const tip = () => json(page, `(() => { const t = document.querySelector('.tb-warn-tip'); return t && !t.hidden ? t.textContent : null; })()`);
    check('no sentence is on the screen until it is asked for', (await tip()) === null);
    await mouse(page, 'mouseMoved', shown[0].x, shown[0].y, 0);
    await page.sleep(250);
    const said = await tip();
    check('hovering a mark says what is wrong, in the rule\'s own words', Boolean(said) && /20 in \(508 mm\) apart/.test(said) && /27 to 33 in/.test(said), String(said));
    await mouse(page, 'mouseMoved', shown[0].x + 200, shown[0].y + 150, 0);
    await page.sleep(250);
    check('and takes it away again when the pointer leaves', (await tip()) === null);

    const steps = await undoCount(page);
    await click(page, shown[0].x, shown[0].y);
    await page.until('window.trackBuilder.selection.size === 1', 5000);
    const sel = await json(page, '[...window.trackBuilder.selection]');
    check('a click on a mark selects that gate', gates.some((g) => g.id === sel[0]) && (await undoCount(page)) === steps);
    const card = await page.evaluate("document.getElementById('tb-card').hidden ? '' : [...document.querySelectorAll('#tb-card .tb-card-warn')].map((n) => n.textContent).join(' | ')");
    check('and its card says it again in words', /20 in \(508 mm\) apart/.test(card), card);

    /* Pulled apart, the mark goes while the button is still down. */
    const other = gates.find((g) => g.id !== sel[0] && Math.hypot(g.x - gates[0].x, g.y - gates[0].y) < 1);
    const mine = gates.find((g) => g.id === sel[0]);
    const from = await screenOf(page, 'view3d', mine.x + (mine.x > other.x ? 0.16 : -0.16), mine.y, 0.35);
    const to = await screenOf(page, 'view3d', mine.x + (mine.x > other.x ? 0.16 : -0.16) + (mine.x > other.x ? 0.5 : -0.5), mine.y, 0.35);
    await drag(page, from, to, { steps: 10, hold: true });
    await page.sleep(200);
    check('pulled to a legal distance, the marks go before the button is let up', (await badges()).length === 0, JSON.stringify(await badges()));
    check('even though the pair is now "nearly a pair", which is a note and not a warning, and is not marked', await page.evaluate('window.trackBuilder.warnings.some((w) => w.code === "rg-spacing-near" && w.level === "info")'));
    await release(page, to);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('and stay gone after', (await badges()).length === 0);
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.sleep(300);
    check('undo brings the rule back, and the marks with it', (await badges()).length === 2);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE ROOM WORKS WITH FINGERS. A tablet is how a track gets built standing in the
 * hall it is for, and the room used to read a second finger as a new first one.
 * One finger does what the mouse does: a tap places or selects, a drag on a gate
 * moves it, a drag on the floor looks round. A second finger takes the camera,
 * and whatever the first was doing is put back: sliding, pinching, twisting. What
 * is asserted is what the hand sees: the floor stays under the fingers, a
 * clockwise twist turns the room clockwise, a piece half pulled goes home, a
 * finger left behind by a lifted pair does nothing.
 */
kase('touch', async () => {
  const page = await openBuilder('?class=micro', 1024, 768, { touch: true });
  try {
    await trapToasts(page);
    const orbit = () => json(page, '({ r: window.trackBuilder.view3d.orbit.radius, t: window.trackBuilder.view3d.orbit.theta, p: window.trackBuilder.view3d.orbit.phi, x: window.trackBuilder.view3d.orbit.target.x, y: window.trackBuilder.view3d.orbit.target.y, z: window.trackBuilder.view3d.orbit.target.z })');
    const same = (a, b) => Math.abs(a.r - b.r) < 1e-9 && Math.abs(a.t - b.t) < 1e-9 && Math.abs(a.p - b.p) < 1e-9 && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
    const canvas = await json(page, "(() => { const c = document.getElementById('tb-3d'); const r = c.getBoundingClientRect(); const s = getComputedStyle(c); return { touchAction: s.touchAction, select: s.userSelect, w: r.width, h: r.height, l: r.left, t: r.top }; })()");
    check('the room takes the touches itself: no page scroll or pinch on it', canvas.touchAction === 'none' && canvas.select === 'none', JSON.stringify(canvas));
    const coarse = await page.evaluate("matchMedia('(pointer: coarse)').matches");
    const mark = await page.evaluate(`(() => { const b = document.createElement('button'); b.className = 'tb-bubble'; document.querySelector('.tb-overlay').append(b); const w = b.getBoundingClientRect().width; b.remove(); return w; })()`);
    check('on a screen that is touched the numbers and marks are finger sized', !coarse || mark >= 30, `coarse ${coarse}, ${mark}px`);

    /* A tap with a tool armed places, and the tool stays armed. */
    await tool(page, 'Gate');
    for (const [x, y] of [[5, 6], [5, 7.5]]) {
      const at = await screenOf(page, 'view3d', x, y, 0);
      await tap(page, at);
    }
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    let gates = (await elements(page)).filter((e) => e.type === 'gate');
    check('a tap with a gate armed places it, and another places the next: two gates, two steps', gates.length === 2 && (await undoCount(page)) === 2, `${gates.length} gates, ${await undoCount(page)} steps`);
    check('and the tool is still armed', await page.evaluate("window.trackBuilder.armed === 'gate'"));
    await key(page, 'Escape');
    /* The card floats by whatever is selected, and a tap under it is a tap on the
     * card, so what the last placement left selected is let go of first. */
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    /* A tap on a gate selects it; a tap on the empty floor lets go. */
    const first = gates[0];
    const on = await screenOf(page, 'view3d', first.x + 0.16, first.y, 0.35);
    await tap(page, on);
    check('a tap on a gate selects it and the card is up', await page.evaluate(`window.trackBuilder.selection.has('${first.id}') && !document.getElementById('tb-card').hidden`));
    const bare = await screenOf(page, 'view3d', 6.6, 7.4, 0);
    await tap(page, bare);
    check('a tap on the empty floor lets go of it', (await page.evaluate('window.trackBuilder.selection.size')) === 0);
    check('and none of that is an edit', (await undoCount(page)) === 2);

    /* One finger on the floor looks round; on a gate it moves it. */
    const before = await orbit();
    await swipe(page, bare, { x: bare.x + 90, y: bare.y + 20 });
    const looked = await orbit();
    check('one finger dragged over the floor looks round the room', Math.abs(looked.t - before.t) > 0.1 && (await undoCount(page)) === 2, `${before.t} then ${looked.t}`);
    gates = (await elements(page)).filter((e) => e.type === 'gate');
    const start = { x: gates[1].x, y: gates[1].y };
    const grab = await screenOf(page, 'view3d', gates[1].x + 0.16, gates[1].y, 0.35);
    const drop = await screenOf(page, 'view3d', gates[1].x + 0.16 + 0.5, gates[1].y + 0.3, 0.35);
    await swipe(page, grab, drop, { steps: 10 });
    const pulled = (await elements(page)).filter((e) => e.type === 'gate')[1];
    check('one finger dragged on a gate moves it, as one step', Math.hypot(pulled.x - start.x, pulled.y - start.y) > 0.3 && (await undoCount(page)) === 3, `${pulled.x - start.x}, ${pulled.y - start.y}; ${await undoCount(page)} steps`);
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.sleep(200);

    /* A second finger while a gate is being pulled puts it back. */
    const home = (await elements(page)).filter((e) => e.type === 'gate')[1];
    const g1 = await screenOf(page, 'view3d', home.x + 0.16, home.y, 0.35);
    await touch(page, 'touchStart', at1(g1));
    for (let i = 1; i <= 6; i += 1) {
      await touch(page, 'touchMove', at1({ x: g1.x + i * 8, y: g1.y + i * 3 }));
      await page.sleep(25);
    }
    const midway = (await elements(page)).filter((e) => e.type === 'gate')[1];
    check('mid pull the gate is away from where it was', Math.hypot(midway.x - home.x, midway.y - home.y) > 0.05, `${midway.x - home.x}`);
    await touch(page, 'touchStart', [{ id: 1, x: g1.x + 48, y: g1.y + 18 }, { id: 2, x: g1.x + 200, y: g1.y - 120 }]);
    await page.sleep(100);
    const put = (await elements(page)).filter((e) => e.type === 'gate')[1];
    check('a second finger puts it back where it was, and leaves no step', Math.hypot(put.x - home.x, put.y - home.y) < 1e-9 && (await undoCount(page)) === 2, `${put.x - home.x}; ${await undoCount(page)} steps`);
    const settled = await orbit();
    await touch(page, 'touchMove', [{ id: 1, x: g1.x + 90, y: g1.y + 40 }, { id: 2, x: g1.x + 200, y: g1.y - 120 }]);
    await page.sleep(80);
    await touch(page, 'touchEnd', []);
    await page.sleep(160);
    check('and the pair that took it is the camera, not an edit', (await undoCount(page)) === 2);
    void settled;
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    /* The pair: a floor point under the fingers stays under them. */
    const P = { x: 5, y: 6.75 };
    await page.evaluate('window.trackBuilder.view3d.frameTrack(), window.trackBuilder.view3d.applyCamera(), 1');
    await page.sleep(200);
    let s0 = await screenOf(page, 'view3d', P.x, P.y, 0);
    let r0 = await orbit();
    await pair(page, [{ x: s0.x - 60, y: s0.y }, { x: s0.x + 60, y: s0.y }], [{ x: s0.x - 130, y: s0.y }, { x: s0.x + 130, y: s0.y }], { steps: 10 });
    let s1 = await screenOf(page, 'view3d', P.x, P.y, 0);
    let r1 = await orbit();
    check('pinching out brings the room closer, by the ratio the fingers spread', r1.r < r0.r * 0.6 && r1.r > r0.r * 0.42, `${r0.r} then ${r1.r}`);
    check('and what was between the fingers is still between them', Math.hypot(s1.x - s0.x, s1.y - s0.y) < 6, `${Math.hypot(s1.x - s0.x, s1.y - s0.y).toFixed(1)} px`);
    check('none of it is an edit', (await undoCount(page)) === 2);
    s0 = await screenOf(page, 'view3d', P.x, P.y, 0);
    r0 = await orbit();
    await pair(page, [{ x: s0.x - 130, y: s0.y }, { x: s0.x + 130, y: s0.y }], [{ x: s0.x - 50, y: s0.y }, { x: s0.x + 50, y: s0.y }], { steps: 10 });
    r1 = await orbit();
    check('pinching in takes it away again', r1.r > r0.r * 1.8, `${r0.r} then ${r1.r}`);

    s0 = await screenOf(page, 'view3d', P.x, P.y, 0);
    await pair(page, [{ x: s0.x - 60, y: s0.y }, { x: s0.x + 60, y: s0.y }], [{ x: s0.x - 60 + 90, y: s0.y + 40 }, { x: s0.x + 60 + 90, y: s0.y + 40 }], { steps: 10 });
    s1 = await screenOf(page, 'view3d', P.x, P.y, 0);
    const slid = { x: s1.x - s0.x, y: s1.y - s0.y };
    check('two fingers sliding take the room with them: it goes the way they went', slid.x > 60 && slid.y > 20 && Math.abs(slid.x - 90) < 25 && Math.abs(slid.y - 40) < 25, JSON.stringify(slid));

    /* Twisted clockwise, the room turns clockwise, looked at from above. */
    await page.evaluate('window.trackBuilder.showPlan(), 1');
    await page.sleep(500);
    /* The floor point the camera looks at: the scene's z is the document's minus y. */
    const T = await json(page, '({ x: window.trackBuilder.view3d.orbit.target.x, y: -window.trackBuilder.view3d.orbit.target.z })');
    const Q = { x: T.x + 1.0, y: T.y };
    const target = await screenOf(page, 'view3d', T.x, T.y, 0);
    const q0 = await screenOf(page, 'view3d', Q.x, Q.y, 0);
    const angle0 = Math.atan2(q0.y - target.y, q0.x - target.x);
    const twist = 0.7;
    const mid = { x: target.x + 40, y: target.y + 40 };
    const ends = (a) => [{ x: mid.x - Math.cos(a) * 80, y: mid.y - Math.sin(a) * 80 }, { x: mid.x + Math.cos(a) * 80, y: mid.y + Math.sin(a) * 80 }];
    await pair(page, ends(0), ends(twist), { steps: 14 });
    const target1 = await screenOf(page, 'view3d', T.x, T.y, 0);
    const q1 = await screenOf(page, 'view3d', Q.x, Q.y, 0);
    let turned = Math.atan2(q1.y - target1.y, q1.x - target1.x) - angle0;
    if (turned > Math.PI) {
      turned -= 2 * Math.PI;
    } else if (turned < -Math.PI) {
      turned += 2 * Math.PI;
    }
    check('twisting the fingers clockwise turns the room clockwise by about the same angle', Math.abs(turned - twist) < 0.15, `${turned.toFixed(3)} rad for a ${twist} rad twist`);

    /* A second finger that comes down on the card is still the second finger. */
    const cardGate = (await elements(page)).filter((e) => e.type === 'gate')[0];
    await page.evaluate(`window.trackBuilder.setSelection(['${cardGate.id}']), 1`);
    await page.sleep(300);
    const cardBox = await json(page, "(() => { const r = document.getElementById('tb-card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20, hidden: document.getElementById('tb-card').hidden }; })()");
    const onFloor = { x: canvas.l + 60, y: canvas.t + 120 };
    const hand = await orbit();
    const stepsCard = await undoCount(page);
    await touch(page, 'touchStart', at1(onFloor));
    await touch(page, 'touchStart', [{ id: 1, ...onFloor }, { id: 2, x: cardBox.x, y: cardBox.y }]);
    for (let i = 1; i <= 8; i += 1) {
      await touch(page, 'touchMove', [{ id: 1, ...onFloor }, { id: 2, x: cardBox.x + i * 6, y: cardBox.y + i * 4 }]);
      await page.sleep(25);
    }
    const spread = await orbit();
    await touch(page, 'touchEnd', []);
    await page.sleep(200);
    check('with the card up, the second finger on it still joins: the pair zooms', !cardBox.hidden && spread.r < hand.r * 0.95, `${hand.r} then ${spread.r}`);
    check('and the card, which it landed on, was not pressed', (await undoCount(page)) === stepsCard);
    check('and lifting the pair did not let go of what was selected', await page.evaluate(`window.trackBuilder.selection.has('${cardGate.id}')`));
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    /* With a tool armed the first finger of a pair is a press that would place on
     * release; the pair is the camera, and places nothing. */
    await page.evaluate("window.trackBuilder.arm('gate'), 1");
    const armedCount = (await elements(page)).length;
    await pair(page, [{ x: canvas.l + 120, y: canvas.t + 140 }, { x: canvas.l + 240, y: canvas.t + 140 }], [{ x: canvas.l + 100, y: canvas.t + 140 }, { x: canvas.l + 260, y: canvas.t + 140 }], { steps: 6 });
    check('a pair with a gate armed places nothing', (await elements(page)).length === armedCount && (await undoCount(page)) === stepsCard);
    await page.evaluate('window.trackBuilder.disarm(), 1');

    /* A finger left behind by a lifted pair does nothing until the hand is off. */
    const keep = await orbit();
    const steps = await undoCount(page);
    const a = { x: 400, y: 400 };
    const b = { x: 560, y: 400 };
    await touch(page, 'touchStart', [{ id: 1, ...a }]);
    await touch(page, 'touchStart', [{ id: 1, ...a }, { id: 2, ...b }]);
    await touch(page, 'touchMove', [{ id: 1, x: a.x, y: a.y + 10 }, { id: 2, ...b }]);
    /* A touch end names the fingers that lift: the second one goes, the first stays down. */
    await touch(page, 'touchEnd', [{ id: 2, ...b }]);
    await page.sleep(80);
    const afterPair = await orbit();
    for (let i = 1; i <= 6; i += 1) {
      await touch(page, 'touchMove', [{ id: 1, x: a.x + i * 20, y: a.y + 10 + i * 10 }]);
      await page.sleep(25);
    }
    const leftover = await orbit();
    check('the finger that stays down after the other lifts does not go on to move the room', same(afterPair, leftover), JSON.stringify([afterPair, leftover]));
    await touch(page, 'touchEnd', []);
    await page.sleep(160);
    check('and lifting it is not a tap', (await undoCount(page)) === steps && (await page.evaluate('window.trackBuilder.selection.size')) === 0);
    void keep;
    await swipe(page, { x: 500, y: 500 }, { x: 560, y: 520 });
    check('the next single finger is a single finger again', !same(leftover, await orbit()));

    /* A hand that never reported its lift (a finger lost to the browser) does not
     * lock the room: the next first finger is a first finger. */
    await page.evaluate(`(() => { const e = window.trackBuilder.view3d.editor; e.touches.set(99, { x: 0, y: 0 }); return 1; })()`);
    const lonely = (await elements(page)).filter((e) => e.type === 'gate')[1];
    await page.evaluate('window.trackBuilder.frameAll(), window.trackBuilder.view3d.frameTrack(), 1');
    await page.sleep(300);
    await tap(page, await screenOf(page, 'view3d', lonely.x + 0.16, lonely.y, 0.35));
    check('a lost lift is forgotten by the next hand: a tap still selects', await page.evaluate(`window.trackBuilder.selection.has('${lonely.id}')`));
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    /* The ring at a gate's foot: a finger a little off it still has it. */
    await page.evaluate('window.trackBuilder.frameAll(), 1');
    await page.evaluate('window.trackBuilder.view3d.frameTrack(), 1');
    await page.sleep(300);
    const gate = (await elements(page)).filter((e) => e.type === 'gate')[0];
    await page.evaluate(`window.trackBuilder.setSelection(['${gate.id}']), 1`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const ringR = 0.7112 / 2 + 0.32;
    /* A side of the ring where the room is what is under the finger and not the card,
     * which floats to one side or the other of what is selected. */
    let clear = null;
    let edge = null;
    for (const sgn of [-1, 1]) {
      edge = (r) => screenOf(page, 'view3d', gate.x + sgn * r, gate.y, 0.008);
      const p = await edge(ringR);
      if (await page.evaluate(`document.elementFromPoint(${p.x}, ${p.y}) === document.getElementById('tb-3d')`)) {
        clear = sgn;
        break;
      }
    }
    check('a side of the ring is clear of the card', clear !== null);
    const e0 = await edge(ringR + 0.07);
    const e1 = await edge(ringR + 0.12);
    const pxPer = Math.hypot(e1.x - e0.x, e1.y - e0.y) / 0.05;
    const off = ringR + 0.07 + 9 / pxPer;
    const press = await edge(off);
    const probe = (pointerType) => page.evaluate(`(() => { const h = window.trackBuilder.view3d.pickHit({ clientX: ${press.x}, clientY: ${press.y}, pointerType: '${pointerType}' }); return !!(h && h.ring); })()`);
    check('9 px outside the ring, a mouse misses it', (await probe('mouse')) === false, JSON.stringify(press));
    check('and a finger has it', (await probe('touch')) === true);
    const steps2 = await undoCount(page);
    const south = await screenOf(page, 'view3d', gate.x, gate.y - ringR, 0.008);
    const yawWas = (await elements(page)).find((e) => e.id === gate.id).yaw;
    await swipe(page, press, south, { steps: 14 });
    const yawNow = (await elements(page)).find((e) => e.id === gate.id).yaw;
    check('and pulling it round turns the gate: it faces where the finger went', Math.abs(Math.abs(yawNow) - Math.PI / 2) < 1e-3 && Math.abs(yawNow - yawWas) > 1, `${yawWas} to ${yawNow}`);
    check('as one undo step', (await undoCount(page)) === steps2 + 1, `${steps2} then ${await undoCount(page)}`);

    /* What a keyboard did, a button does. */
    const turnBtn = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Turn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; })()`);
    check('the card has a Turn button, since there is no Q or E, and it is finger sized', Boolean(turnBtn) && (!coarse || turnBtn.h >= 40), JSON.stringify(turnBtn));
    if (turnBtn) {
      const yaw1 = (await elements(page)).find((e) => e.id === gate.id).yaw;
      await tap(page, turnBtn);
      const yaw2 = (await elements(page)).find((e) => e.id === gate.id).yaw;
      let d = Math.abs(yaw2 - yaw1);
      d = Math.min(d, 2 * Math.PI - d);
      check('a tap on it turns the gate a quarter', Math.abs(d - Math.PI / 2) < 1e-3, `${yaw1} to ${yaw2}`);
    }
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
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
