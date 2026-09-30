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

/* Two clicks a hand's distance in time apart: the second carries a click count of
 * two, which is what makes the page hear a double click. */
async function doubleClick(page, x, y) {
  await mouse(page, 'mouseMoved', x, y, 0);
  for (const n of [1, 2]) {
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: n }, page.sessionId);
    await page.sleep(40);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: n }, page.sessionId);
    await page.sleep(60);
  }
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
 * THE NUMBER ON A GATE IS A BUTTON. Click it and that pass is in focus; double
 * click it, type where that gate should come in the order, press Enter: it goes
 * there, and the numbers close up. That is one undo step, and Escape leaves it
 * alone.
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

    /* One click looks at the pass: it selects the piece and puts the pass in focus,
     * and it is not an edit. */
    await click(page, b[2].x, b[2].y);
    check('a click on a number selects its piece and puts that pass in focus, and is no edit',
      await page.evaluate(`window.trackBuilder.selection.has('${first[2]}') && window.trackBuilder.focusedPass() === window.trackBuilder.doc.sequence[2].id`)
      && (await undoCount(page)) === steps && !(await page.evaluate("!!document.querySelector('.tb-bubble-input')")));
    await doubleClick(page, b[2].x, b[2].y);
    await page.until("!!document.querySelector('.tb-bubble-input')", 5000);
    await page.evaluate("(() => { const i = document.querySelector('.tb-bubble-input'); i.value = '1'; return 1; })()");
    await key(page, 'Enter');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const now = await order();
    check('typing 1 into the number on the third gate makes it the first', now[0] === first[2] && now[1] === first[0] && now[2] === first[1], now.join());
    check('as one undo step', (await undoCount(page)) === steps + 1);
    b = await bubbles();
    check('and the numbers close up, one of each', b.map((x) => x.text).sort().join() === '1,2,3', b.map((x) => x.text).join());

    await doubleClick(page, b[0].x, b[0].y);
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
    check('and has no strip of passes along the foot, which would be a lone plus for a lap with nothing in it', (await page.evaluate("document.querySelectorAll('.tb-strip').length")) === 0);
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
    check('and the strip of passes comes with the gates, one chip for each and the plus', (await page.evaluate("document.querySelectorAll('.tb-strip .tb-chip[data-seq]').length")) === 2 && (await page.evaluate("document.querySelectorAll('.tb-strip .tb-chip-add').length")) === 1);
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

/* A More menu item, by the words on it, pressed with the mouse. */
async function menu(page, label) {
  const where = (selector, text) => json(page, `(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent === ${JSON.stringify(text)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  const more = await where('#tb-topbar .tb-more > button', 'More');
  await click(page, more.x, more.y);
  await page.until("!document.querySelector('.tb-more-menu').hidden", 5000);
  const item = await where('.tb-more-item', label);
  if (!item) {
    throw new Error(`no menu item called ${label}`);
  }
  await click(page, item.x, item.y);
  await page.sleep(300);
}

/*
 * THE TRACK TRAVELS IN THE ADDRESS. A pilot with a room and a tape measure wants to
 * send a layout to a friend in a message, with no account and no upload: the link
 * carries the whole track after the hash sign, where a browser never sends it. It is
 * opened by a page that has never seen the track (a new browser profile), it opens as
 * a copy under a new id, it says so, it takes itself out of the address so a reload does
 * not open it again, and a link that is not one of ours opens nothing and breaks nothing.
 */
kase('share link', async () => {
  const page = await openBuilder();
  let hash = '';
  let original = null;
  try {
    await trapToasts(page);
    await loadPreset(page, 'racegow5-track3');
    original = await json(page, '({ id: window.trackBuilder.doc.id, name: window.trackBuilder.doc.name, elements: window.trackBuilder.doc.elements, sequence: window.trackBuilder.doc.sequence })');
    await menu(page, 'Copy share link');
    const link = await page.evaluate('window.trackBuilder.lastLink || ""');
    hash = link.slice(link.indexOf('#'));
    check('Copy share link makes a link: the address of the builder, a hash sign and the track', /^https?:\/\/[^#]+\/src\/trackbuilder\/index\.html#track=[zj]\.[A-Za-z0-9_-]+$/.test(link), link.slice(0, 90));
    check('that fits a chat message', link.length < 4000, `${link.length} characters`);
    const said = (await toasts(page)).join(' | ') + await page.evaluate("document.getElementById('tb-modal').textContent");
    check('and says it is copied, or shows it to be copied by hand', /Link copied|Copy this link/.test(said), said.slice(0, 120));
    check('and is not an edit', (await undoCount(page)) === 0);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
  const second = await openBuilder(`?class=micro${hash}`);
  try {
    const got = await json(second, `({
      id: window.trackBuilder.doc.id, name: window.trackBuilder.doc.name, elements: window.trackBuilder.doc.elements, sequence: window.trackBuilder.doc.sequence,
      hash: location.hash, steps: window.trackBuilder.history.past.length, toast: document.getElementById('tb-toast').textContent,
    })`);
    check('a browser that has never seen the track opens it from the link', got.name === original.name && got.elements.length === original.elements.length, `${got.name}, ${got.elements.length} elements`);
    check('every piece and every pass exactly as it was', JSON.stringify(got.elements) === JSON.stringify(original.elements) && JSON.stringify(got.sequence) === JSON.stringify(original.sequence));
    check('as a copy: under a new id, so nothing done to it is done to the original', got.id !== original.id && /^trk-/.test(got.id), got.id);
    check('and says so', /A shared track\. Editing makes your copy\./.test(got.toast), got.toast);
    check('and takes the fragment out of the address, so a reload does not open it again', got.hash === '', got.hash);
    check('and opening it is not an edit', got.steps === 0);
    check('the page reported no error of its own', ownErrors(second).length === 0, ownErrors(second).join(' | '));
  } finally {
    await second.close();
  }
  for (const [what, bad] of [['a link with a payload that is not a track', '#track=z.AAAA'], ['one with a version this does not know', '#track=q.abc'], ['one with nothing in it', '#track=']]) {
    const third = await openBuilder(`?class=micro${bad}`);
    try {
      const doc = await json(third, '({ n: window.trackBuilder.doc.elements.length, toast: document.getElementById("tb-toast").textContent })');
      check(`${what} opens the builder as it was, and says the link could not be opened`, doc.n === 0 && /share link could not be opened/.test(doc.toast) && !/A shared track/.test(doc.toast), JSON.stringify(doc));
      check('with no error of its own', ownErrors(third).length === 0, ownErrors(third).join(' | '));
    } finally {
      await third.close();
    }
  }
});

/*
 * A PICTURE OF THE ROOM, for a chat or a poster. The canvas alone would be a room
 * with no numbers on the gates, because the numbers are HTML laid over it, so the
 * picture is the canvas with them painted on. What is asserted is that a real PNG
 * comes out, the size of the canvas, that is not blank, and that where a number
 * sits on the screen the picture has the number's own colour.
 */
kase('picture', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await loadPreset(page, 'racegow5-track1');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await page.sleep(500);
    await page.evaluate(`(() => {
      window.__downloads = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          window.__downloads.push({ href: this.href, name: this.download });
          window.__taken = fetch(this.href).then((r) => r.blob());
          return undefined;
        }
        return orig.call(this);
      };
      return 1;
    })()`);
    await menu(page, 'Picture');
    await page.until('window.__downloads && window.__downloads.length === 1', 10000);
    const facts = JSON.parse(await page.evaluate(`(async () => {
      const blob = await window.__taken;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const dv = new DataView(bytes.buffer);
      const bitmap = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const canvas = document.getElementById('tb-3d');
      const rect = canvas.getBoundingClientRect();
      const k = canvas.width / rect.width;
      const seen = new Set();
      for (let i = 0; i < 400; i += 1) {
        const p = ctx.getImageData(Math.floor(((i * 37) % c.width)), Math.floor(((i * 91) % c.height)), 1, 1).data;
        seen.add(p.join(','));
      }
      const bubble = [...document.querySelectorAll('.tb-bubble')].find((n) => n.style.display !== 'none');
      const b = bubble.getBoundingClientRect();
      const px = ctx.getImageData(Math.round((b.left - rect.left + b.width / 2 - 6) * k), Math.round((b.top - rect.top + b.height / 2 - 6) * k), 1, 1).data;
      const want = getComputedStyle(bubble).backgroundColor.match(/[0-9.]+/g).map(Number);
      return JSON.stringify({
        name: window.__downloads[0].name, type: blob.type, size: blob.size, sig: [...bytes.slice(0, 8)].join(','),
        w: dv.getUint32(16), h: dv.getUint32(20), cw: canvas.width, ch: canvas.height, colours: seen.size, got: [...px].slice(0, 3), want: want.slice(0, 3),
      });
    })()`));
    check('a PNG is saved, named for the track', facts.name === 'racegow5-track-1.png' || /\.png$/.test(facts.name), facts.name);
    check('a real one: the PNG signature, and the type says so', facts.sig === '137,80,78,71,13,10,26,10' && facts.type === 'image/png', `${facts.sig} ${facts.type}`);
    check('as big as the canvas it was taken from', facts.w === facts.cw && facts.h === facts.ch && facts.w > 400, `${facts.w} by ${facts.h}, canvas ${facts.cw} by ${facts.ch}`);
    check('and not blank', facts.colours > 12, `${facts.colours} colours in 400 samples`);
    check('where a number is on the screen, the picture has the number\'s own colour under it', facts.got.every((v, i) => Math.abs(v - facts.want[i]) <= 24), `picture ${facts.got}, number ${facts.want}`);
    check('and it says it saved', /Saved .*\.png/.test((await toasts(page)).join(' ')), (await toasts(page)).join(' | '));
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(300);
    await menu(page, 'Picture');
    check('in the 2D view it says to open the room first, and saves nothing', (await page.evaluate('window.__downloads.length')) === 1 && /Room or Plan/.test((await toasts(page)).join(' ')));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE BUILD SHEET is the page a pilot takes into the room: where every piece
 * stands measured from a corner, and what to buy. What is asserted is what they
 * would look at: it opens over the builder, it has Track 1's fifteen sections and
 * twelve elbows, the measurements change when the corner does, a name that is markup
 * is text on it, printing shows it and nothing else, and it goes away again.
 */
kase('build sheet', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await page.evaluate(`(() => { window.trackBuilder.doc.name = '<img src=x onerror="window.__pwned=1"> Track 1'; window.trackBuilder.nameInput.value = window.trackBuilder.doc.name; return 1; })()`);
    await menu(page, 'Build sheet');
    const sheet = () => json(page, `(() => {
      const l = document.getElementById('tb-sheet');
      if (!l || l.hidden) return null;
      return { text: l.textContent, rows: [...l.querySelectorAll('.tb-sheet-table')][0].querySelectorAll('tbody tr').length, h1: l.querySelector('h1').textContent, imgs: l.querySelectorAll('img').length, svg: l.querySelectorAll('svg circle').length, firstX: l.querySelector('.tb-sheet-table tbody tr td:nth-child(3)').textContent, pwned: window.__pwned === 1 };
    })()`);
    const one = await sheet();
    check('it opens over the builder', Boolean(one));
    check('with seven rows for Track 1: the gate, two stacks, the pole, the pads and two bars', one.rows === 7, String(one.rows));
    check('fifteen sections of 27 in, twelve elbows and two tees', /15sections, 27 in \(686 mm\)/.test(one.text) && /12elbows/.test(one.text) && /2tees/.test(one.text), one.text.replace(/\s+/g, ' ').slice(one.text.indexOf('What to buy'), one.text.indexOf('What to buy') + 200));
    check('a track named with markup is text in the heading, and nothing ran', /<img src=x/.test(one.h1) && one.imgs === 0 && !one.pwned, one.h1);
    check('the plan has a mark for every row and the corner', one.svg >= one.rows);
    await page.evaluate(`(() => { const s = document.querySelector('#tb-sheet select'); s.value = 'ne'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.sleep(200);
    const other = await sheet();
    check('measured from another corner the measurements are different', other.firstX !== one.firstX && /north east/.test(other.text), `${one.firstX} then ${other.firstX}`);
    await page.cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, page.sessionId);
    await page.sleep(200);
    const printed = await json(page, `({
      app: getComputedStyle(document.getElementById('tb-app')).display,
      bar: getComputedStyle(document.querySelector('.tb-sheet-bar')).display,
      position: getComputedStyle(document.getElementById('tb-sheet')).position,
      sheet: getComputedStyle(document.querySelector('.tb-sheet-page')).display,
    })`);
    await page.cdp.send('Emulation.setEmulatedMedia', { media: '' }, page.sessionId);
    check('printing shows the sheet and nothing else: the builder is hidden, the bar with it', printed.app === 'none' && printed.bar === 'none' && printed.position === 'static' && printed.sheet !== 'none', JSON.stringify(printed));
    await key(page, 'Escape');
    check('Escape closes it', (await sheet()) === null);
    /* The lap bar has it too: a pilot in the hall does not hunt through a menu. */
    const lap = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-lapbar button')].find((x) => x.textContent === 'Build sheet'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    check('the bar along the foot has a Build sheet button', Boolean(lap));
    if (lap) {
      await click(page, lap.x, lap.y);
      check('which opens it', (await sheet()) !== null);
      await key(page, 'Escape');
    }
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A TRACK DRAWN IN THE FPV EVENTS DESIGNER, pasted or chosen. The fixture is synthetic
 * with the shapes of a real one. What is asserted is what the pilot sees: it opens as a
 * whoop track named for where it came from, a dialog says what was kept, changed and
 * left out, and text that is not a track is refused in a sentence and changes nothing.
 */
kase('import from the designer', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    const fixture = {
      id: 'synthetic', name: 'Synthetic',
      data: {
        arena: { w: 6, d: 6, h: 3 },
        gates: [
          { typeId: 'square-75', x: 1, z: 2, height: 0, rotY: 0, dir: 'forward', prop: false },
          { typeId: 'square-75', x: 3, z: 2, height: 0, rotY: 1.571, dir: 'back', prop: false },
          { typeId: 'tall-pole-2m', x: 4, z: 4, height: 0, rotY: 0, dir: 'forward', prop: false },
          { typeId: 'tinywhoop-cube', x: 2, z: 5, height: 0, rotY: 0, dir: 'top>right', prop: false },
          { typeId: 'devon-banner', x: 0, z: 1, height: 0.1, rotY: 1.571, dir: 'forward', prop: true },
        ],
        measurements: [[[1, 0, 2], [3, 0, 2]]],
      },
    };
    await menu(page, 'Import');
    await page.until("!!document.querySelector('#tb-modal textarea.tb-paste')", 5000);
    check('Import offers a file and a place to paste', await page.evaluate("[...document.querySelectorAll('#tb-modal button')].some((b) => b.textContent === 'Choose a file') && !!document.querySelector('#tb-modal textarea')"));
    await page.evaluate(`(() => { const t = document.querySelector('#tb-modal textarea.tb-paste'); t.value = ${JSON.stringify(JSON.stringify(fixture))}; return 1; })()`);
    const go = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-modal button')].find((x) => x.textContent === 'Import pasted text'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, go.x, go.y);
    await page.until("!!document.querySelector('#tb-modal h2') && /came across/.test(document.querySelector('#tb-modal h2').textContent)", 10000);
    const doc = await json(page, '({ name: window.trackBuilder.doc.name, cls: window.trackBuilder.doc.trackClass, types: window.trackBuilder.doc.elements.map((e) => e.type), seq: window.trackBuilder.doc.sequence.length })');
    check('it opens as a whoop track named for where it came from', doc.cls === 'micro' && doc.name === 'Synthetic (from the FPV Events designer)', doc.name);
    check('two gates, a pole and a waypoint for the cube in the flying order, and the banner standing in the room and not flown',
      doc.types.join() === 'gate,gate,pole,waypoint,banner' && doc.seq === 4, `${doc.types.join()} ${doc.seq}`);
    const said = await page.evaluate("document.getElementById('tb-modal').textContent");
    check('the dialog says what was kept, changed and left out, and that the banner became one of ours',
      /Kept/.test(said) && /Changed/.test(said) && /Left out/.test(said) && /it became a banner/.test(said) && /cube/.test(said) && /tape measurement/.test(said), said.slice(0, 200));
    await key(page, 'Escape');
    await page.evaluate("window.trackBuilder.closeModal(), 1");
    await menu(page, 'Import');
    await page.evaluate(`(() => { const t = document.querySelector('#tb-modal textarea.tb-paste'); t.value = 'this is not a track'; return 1; })()`);
    const go2 = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-modal button')].find((x) => x.textContent === 'Import pasted text'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const before = await page.evaluate('window.trackBuilder.doc.name');
    await click(page, go2.x, go2.y);
    check('text that is not a track is refused in a sentence and changes nothing', /Could not import/.test((await toasts(page)).join(' ')) && (await page.evaluate('window.trackBuilder.doc.name')) === before, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* ------------------------------------------------------------------ */
/* A piece flown more than once                                        */
/* ------------------------------------------------------------------ */

/* The passes module's own answers, asked of the page's live document, so what is on
 * the screen is held to what the pure functions say about the same track. */
const passFacts = async (page, body) => JSON.parse(await page.evaluate(`(async () => {
  const P = await import('/src/trackbuilder/passes.js');
  const doc = window.trackBuilder.doc;
  return JSON.stringify((() => { ${body} })());
})()`));

/* Where a piece of the page is, measured twice a frame apart until it stops: a strip
 * scrolls a chip into view, the room spreads its tags apart, and a press has to be
 * aimed at where the thing ended up. */
async function settled(page, selector, { scroll = false } = {}) {
  const measure = () => json(page, `(() => {
    const n = document.querySelector(${JSON.stringify(selector)});
    if (!n) return null;
    ${scroll ? 'n.scrollIntoView({ block: "nearest", inline: "nearest" });' : ''}
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  let last = await measure();
  for (let i = 0; i < 25; i += 1) {
    await page.sleep(120);
    const now = await measure();
    if (now && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) {
      return now;
    }
    last = now;
  }
  return last;
}

const chipOf = (seq) => `.tb-strip .tb-chip[data-seq="${seq}"]`;
const seqIds = (page) => json(page, 'window.trackBuilder.doc.sequence.map((q) => q.id)');
const focusOf = (page) => page.evaluate('window.trackBuilder.focusedPass()');

/*
 * A PIECE FLOWN MORE THAN ONCE IS ONE PIECE IN THE ROOM, AND ITS PASSES ARE ON A
 * STRIP. Track 8 flies 14 pieces 29 times, and the room used to hang 29 numbers,
 * 29 pairs of panes and 29 arrows on them. What is asserted is what a pilot does:
 * point at a pass, click it, take it out, fly it again, and see the same pass lit
 * on the strip, in the room and on the card, without looking having made an edit.
 */
kase('one piece, many passes', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await loadPreset(page, 'racegow5-track8');
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    await page.sleep(600);
    const facts = await passFacts(page, `
      const tags = P.tagsOf(doc);
      const most = tags.reduce((a, t) => (t.passes.length > a.passes.length ? t : a), tags[0]);
      return {
        tags: tags.length, reuse: P.reuseOf(doc), sequence: doc.sequence.length,
        most: { elementId: most.elementId, passes: most.passes.map((p) => ({ seqId: p.seq.id, number: p.number })) },
      };`);
    const pole = facts.most;
    check('Track 8 is 14 pieces flown 29 times', facts.reuse.pieces === 14 && facts.reuse.passes === 29, JSON.stringify(facts.reuse));
    check('and its busiest piece is flown six times', pole.passes.length === 6, pole.passes.map((p) => p.number).join(','));

    const tagCount = await page.evaluate("document.querySelectorAll('.tb-numtag').length");
    check('the room has one tag for each opening that is flown, and not one for each pass', tagCount === facts.tags && tagCount < facts.reuse.passes, `${tagCount} tags for ${facts.reuse.passes} passes`);
    const bar = await page.evaluate("document.getElementById('tb-lapbar').textContent");
    check('the lap bar says passes on pieces, and not gates', /Passes\s*29 on 14 pieces/.test(bar) && !/Gates/.test(bar), bar.replace(/\s+/g, ' ').slice(0, 90));

    const chips = await json(page, `[...document.querySelectorAll('.tb-strip .tb-chip[data-seq]')].map((c) => ({ seq: c.dataset.seq, text: c.textContent, bend: c.classList.contains('tb-chip-bend') }))`);
    const ids = await seqIds(page);
    check('the strip has a chip for every pass in flying order, a waypoint as a dot',
      chips.length === ids.length && chips.every((c, i) => c.seq === ids[i]) && chips.filter((c) => !c.bend).map((c) => c.text).join() === Array.from({ length: 29 }, (_, i) => i + 1).join(),
      `${chips.length} chips for ${ids.length} passes`);

    /* A toolbar of buttons: a list item role would take a chip's button role away from a screen reader. */
    check('the strip is a labelled toolbar and its chips are buttons still', (await page.evaluate(`(() => { const s = document.querySelector('.tb-strip'); const c = [...s.querySelectorAll('.tb-chip')]; return s.getAttribute('role') === 'toolbar' && !!s.getAttribute('aria-label') && c.every((x) => x.tagName === 'BUTTON' && !x.hasAttribute('role') && (x.getAttribute('aria-label') || x.textContent)); })()`)));
    /* The whole strip is one stop for Tab, from the start and not only once a chip has been used. */
    const stops = () => json(page, `[...document.querySelectorAll('.tb-strip .tb-chip[tabindex="0"]')].map((c) => c.dataset.seq || 'add')`);
    check('the strip is one tab stop from the start, and not one for each of its chips', (await stops()).length === 1, `${(await stops()).length} tab stops`);

    /* Pointing at a chip lights that pass everywhere and selects nothing. */
    const steps = await undoCount(page);
    const third = pole.passes[2];
    let at = await settled(page, chipOf(third.seqId), { scroll: true });
    await mouse(page, 'mouseMoved', at.x, at.y, 0);
    await page.until(`window.trackBuilder.focusedPass() === '${third.seqId}'`, 5000);
    await page.sleep(300);
    const lit = await json(page, `({ on: [...document.querySelectorAll('.tb-strip .tb-chip.on')].map((c) => c.dataset.seq), current: [...document.querySelectorAll('.tb-strip .tb-chip[aria-current]')].map((c) => c.dataset.seq), ringed: document.querySelectorAll('.tb-strip .tb-chip.linked').length, picked: window.trackBuilder.selection.size, room: window.trackBuilder.view3d.focusSeq })`);
    check('pointing at a chip puts that pass in focus, in the room too, and selects nothing', lit.on.join() === third.seqId && lit.room === third.seqId && lit.picked === 0, JSON.stringify(lit));
    check('and the chip in focus is the one a screen reader is told is current', lit.current.join() === third.seqId, lit.current.join());
    check('and rings the other five passes of the same piece on the strip', lit.ringed === 5, `${lit.ringed} ringed`);
    check('looking is no edit', (await undoCount(page)) === steps);
    await mouse(page, 'mouseMoved', 800, 300, 0);
    await page.until('window.trackBuilder.focusedPass() === null', 5000);
    check('the pointer going away lets the focus go', (await page.evaluate("document.querySelectorAll('.tb-strip .tb-chip.on').length")) === 0);

    /* A click selects the piece and keeps that pass in focus; the card names all six. */
    at = await settled(page, chipOf(third.seqId), { scroll: true });
    await click(page, at.x, at.y);
    await page.until("!document.getElementById('tb-card').hidden", 5000);
    check('a click on a chip selects its piece and puts that pass in focus, and is no edit', (await page.evaluate(`window.trackBuilder.selection.has('${pole.elementId}') && window.trackBuilder.focusedPass() === '${third.seqId}'`)) && (await undoCount(page)) === steps);
    /* The pointer is what the focus follows while it is on a chip. The click's own
     * part is what is left when it goes: the pass stays pinned, and does not fall back
     * to the first pass of the piece. */
    await mouse(page, 'mouseMoved', 800, 300, 0);
    await page.until('window.trackBuilder.passHover === null', 5000);
    await page.sleep(200);
    check('and the pass stays in focus when the pointer has gone', (await focusOf(page)) === third.seqId && (await page.evaluate("document.querySelectorAll('.tb-strip .tb-chip.on').length")) === 1, `${await focusOf(page)} for ${third.seqId}`);
    const card = await json(page, `({ title: document.querySelector('#tb-card .tb-card-head strong, #tb-card strong')?.textContent, chips: [...document.querySelectorAll('#tb-card .tb-card-passes .tb-chip')].map((c) => ({ text: c.textContent, on: c.classList.contains('on') })), buttons: [...document.querySelectorAll('#tb-card button')].map((b) => b.textContent) })`);
    check('the card says the piece is flown six times and lists the passes', /flown 6 times/.test(card.title) && card.chips.map((c) => c.text).join() === pole.passes.map((p) => p.number).join(), `${card.title} | ${card.chips.map((c) => c.text).join()}`);
    check('with this pass filled', card.chips.filter((c) => c.on).map((c) => c.text).join() === String(third.number), card.chips.filter((c) => c.on).map((c) => c.text).join());
    check('and Fly again and Remove piece among its buttons', card.buttons.includes('Fly again') && card.buttons.includes('Remove piece') && card.buttons.includes('Remove this pass'), card.buttons.join(' | '));

    /* The card's own chips turn the focus, and the strip follows. */
    const fifth = pole.passes[4];
    const cardChip = await settled(page, `#tb-card .tb-card-passes .tb-chip[data-seq="${fifth.seqId}"]`);
    await click(page, cardChip.x, cardChip.y);
    await page.until(`window.trackBuilder.focusedPass() === '${fifth.seqId}'`, 5000);
    const turned = await json(page, `({ strip: [...document.querySelectorAll('.tb-strip .tb-chip.on')].map((c) => c.dataset.seq), card: [...document.querySelectorAll('#tb-card .tb-card-passes .tb-chip.on')].map((c) => c.textContent), order: document.querySelector('#tb-card [data-tbkey^="card-order-"]')?.value })`);
    check('a chip on the card turns the focus, and the strip and the card agree', turned.strip.join() === fifth.seqId && turned.card.join() === String(fifth.number) && turned.order === String(fifth.number), JSON.stringify(turned));

    /* Passing over another pass of the piece lights it in the room and leaves the card
     * about the pass that was chosen, even when the card is drawn again meanwhile. */
    const other = pole.passes[1];
    const otherChip = await settled(page, chipOf(other.seqId), { scroll: true });
    await mouse(page, 'mouseMoved', otherChip.x, otherChip.y, 0);
    await page.until(`window.trackBuilder.focusedPass() === '${other.seqId}'`, 5000);
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.elementId}']), 1`);
    await page.sleep(300);
    const passing = await json(page, `({ room: window.trackBuilder.view3d.focusSeq, card: [...document.querySelectorAll('#tb-card .tb-card-passes .tb-chip.on')].map((c) => c.textContent), order: document.querySelector('#tb-card [data-tbkey^="card-order-"]')?.value })`);
    check('passing over another pass lights it in the room and leaves the card about the pass that was chosen', passing.room === other.seqId && passing.card.join() === String(fifth.number) && passing.order === String(fifth.number), JSON.stringify(passing));
    await mouse(page, 'mouseMoved', 800, 300, 0);
    await page.until(`window.trackBuilder.focusedPass() === '${fifth.seqId}'`, 5000);
    check('and the pointer going away puts the room back on the pass that was chosen', true);

    /* Fly again puts one more pass at the end, in focus; Remove this pass takes just that one. */
    const before = await seqIds(page);
    const stepsA = await undoCount(page);
    const fly = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Fly again'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, fly.x, fly.y);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length + 1}`, 5000);
    const after = await seqIds(page);
    const made = await json(page, `window.trackBuilder.doc.sequence[window.trackBuilder.doc.sequence.length - 1]`);
    check('Fly again adds one pass at the end of the lap through this piece, as one undo step', after.slice(0, -1).join() === before.join() && made.elementId === pole.elementId && (await undoCount(page)) === stepsA + 1, `${before.length} then ${after.length}`);
    const tagText = () => page.evaluate(`document.querySelector('.tb-numtag[data-key^="${pole.elementId}"]')?.textContent ?? ''`);
    await page.until(`/\\u00d77/.test(document.querySelector('.tb-numtag[data-key^="${pole.elementId}"]')?.textContent ?? '')`, 5000).catch(() => {});
    check('and the new pass is the one in focus, and the tag says seven', (await focusOf(page)) === made.id && /\u00d77/.test(await tagText()), `${await focusOf(page)} for ${made.id}: ${await tagText()}`);
    await page.sleep(200);
    const rem = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Remove this pass'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, rem.x, rem.y);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length}`, 5000);
    check('Remove this pass takes only that pass, and the lap is as it was', (await seqIds(page)).join() === before.join() && (await page.evaluate(`!!window.trackBuilder.doc.elements.find((e) => e.id === '${pole.elementId}')`)));

    /* Delete on a chip takes that pass out and only that pass, and moves on to the next chip. */
    const victim = pole.passes[3];
    at = await settled(page, chipOf(victim.seqId), { scroll: true });
    await click(page, at.x, at.y);
    const stepsD = await undoCount(page);
    const elementsBefore = JSON.stringify(await elements(page));
    await key(page, 'Delete');
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length - 1}`, 5000);
    const gone = await seqIds(page);
    check('Delete on a chip takes that pass out of the lap and only that pass, as one undo step', gone.join() === before.filter((s) => s !== victim.seqId).join() && (await undoCount(page)) === stepsD + 1);
    check('the piece is still where it stood, and its other passes are still flown', JSON.stringify(await elements(page)) === elementsBefore);
    const next = before[before.indexOf(victim.seqId) + 1];
    await page.until(`document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq === '${next}'`, 5000).catch(() => {});
    const active = await page.evaluate('(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq) || document.activeElement.tagName');
    check('and the keyboard moves on to the next chip', active === next, `${active} for ${next}`);
    await key(page, 'KeyZ', 2);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length}`, 5000);
    check('Control Z brings that pass back in the same place', (await seqIds(page)).join() === before.join());

    /* Arrow keys on a chip walk the strip and nudge nothing. */
    at = await settled(page, chipOf(before[1]), { scroll: true });
    await click(page, at.x, at.y);
    const stepsK = await undoCount(page);
    const placed = JSON.stringify(await elements(page));
    await key(page, 'ArrowRight');
    await page.sleep(150);
    check('the arrow keys walk the strip and move nothing', (await page.evaluate('document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq')) === before[2]
      && JSON.stringify(await elements(page)) === placed && (await undoCount(page)) === stepsK);
    /* And the stop is the chip that last had the keyboard. */
    check('the tab stop is the chip the keyboard is on', (await stops()).join() === before[2], (await stops()).join());
    await key(page, 'Tab');
    check('Tab leaves the strip in one press', await page.evaluate("!document.activeElement.closest('.tb-strip')"));
    await key(page, 'Tab', 8);
    check('and Shift Tab comes back to the chip it left', (await page.evaluate('document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq')) === before[2]);
    /* An edit that makes the strip again does not take the keyboard from the pass that had it. */
    await page.evaluate(`window.trackBuilder.flyPieceAgain('${pole.elementId}', 0), 1`);
    await page.sleep(400);
    check('an edit that repaints the strip gives the keyboard back to the same pass', (await page.evaluate('document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq')) === before[2]);
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.until(`window.trackBuilder.doc.sequence.map((q) => q.id).join() === '${before.join()}'`, 5000);

    /* A drag on the strip moves a pass in the order. The drag is the page's own drag
     * and drop events, because the browser's is not one a protocol can start. */
    const moving = before[4];
    const target = before[1];
    const stepsM = await undoCount(page);
    await page.evaluate(`(() => {
      const from = document.querySelector('${chipOf(moving)}');
      const to = document.querySelector('${chipOf(target)}');
      const data = new DataTransfer();
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
      to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
      to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
      return 1;
    })()`);
    await page.sleep(300);
    const dragged = await seqIds(page);
    check('dragging a chip onto another moves that pass there, as one undo step', dragged.indexOf(moving) === before.indexOf(target) && dragged.length === before.length && (await undoCount(page)) === stepsM + 1, `${before.indexOf(moving)} to ${dragged.indexOf(moving)}`);
    await key(page, 'KeyZ', 2);
    await page.until(`window.trackBuilder.doc.sequence.map((q) => q.id).join() === '${before.join()}'`, 5000);
    check('and Control Z puts it back', true);

    /* The tag in the room: pointed at, it opens into a chip for each of the six. */
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(300);
    const tagAt = await settled(page, `.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble`);
    await mouse(page, 'mouseMoved', tagAt.x, tagAt.y, 0);
    await page.until(`document.querySelectorAll('.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble').length === 6`, 5000);
    const opened = await json(page, `[...document.querySelectorAll('.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble')].map((c) => c.firstChild.textContent)`);
    check('pointed at, the tag opens into a chip for each pass', opened.join() === pole.passes.map((p) => p.number).join(), opened.join());
    const chip24 = await settled(page, `.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble[data-seq="${pole.passes[4].seqId}"]`);
    await mouse(page, 'mouseMoved', chip24.x, chip24.y, 0);
    await page.until(`window.trackBuilder.focusedPass() === '${pole.passes[4].seqId}'`, 5000);
    check('and the pass under the pointer is the pass in focus, on the strip as well', (await page.evaluate(`document.querySelector('.tb-strip .tb-chip.on')?.dataset.seq`)) === pole.passes[4].seqId);
    await mouse(page, 'mouseMoved', 800, 200, 0);
    await page.until('window.trackBuilder.focusedPass() === null', 5000);
    check('the pointer going away closes it again', (await page.evaluate(`document.querySelectorAll('.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble').length`)) === 1);

    /* A double click on one chip of an opened tag gives that pass another place. */
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.elementId}']), 1`);
    await page.sleep(400);
    const second = pole.passes[1];
    const chip4 = await settled(page, `.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble[data-seq="${second.seqId}"]`);
    const stepsR = await undoCount(page);
    await doubleClick(page, chip4.x, chip4.y);
    await page.until("!!document.querySelector('.tb-bubble-input')", 5000);
    await page.evaluate("(() => { const i = document.querySelector('.tb-bubble-input'); i.value = '10'; return 1; })()");
    await key(page, 'Enter');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const renum = await seqIds(page);
    check('a double click on the second chip, 10 and Enter, gives that pass the tenth place, as one undo step', renum[9] === second.seqId && renum.length === before.length && (await undoCount(page)) === stepsR + 1, `now at ${renum.indexOf(second.seqId) + 1}`);
    await key(page, 'KeyZ', 2);
    await page.until(`window.trackBuilder.doc.sequence.map((q) => q.id).join() === '${before.join()}'`, 5000);
    check('and Control Z puts it back', true);

    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE PLAN SAYS THE SAME THING. Drawn on a canvas and not in the page, so this reads the
 * pixels: the tag of the pass in focus is lit, the tags of pieces the focus is not about
 * are drawn back, and a piece flown more than once shows its count and not a stack of
 * numbers.
 */
kase('the plan shows one tag for each opening', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track8');
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(500);
    const facts = await passFacts(page, `
      const tags = P.tagsOf(doc);
      const most = tags.reduce((a, t) => (t.passes.length > a.passes.length ? t : a), tags[0]);
      const single = tags.find((t) => t.passes.length === 1 && t.apertureIndex === 0 && t.elementId !== most.elementId);
      return { most: most.elementId, single: single.elementId };`);
    /* The pixel under the left of a tag's circle, clear of the digit written in the middle. */
    const tagPixel = (id) => json(page, `(() => {
      const v = window.trackBuilder.view2d;
      const el = window.trackBuilder.doc.elements.find((e) => e.id === '${id}');
      const c = v.toScreen(el.position);
      const d = v.canvas.getContext('2d').getImageData(Math.round((c.x - 6.5) * v.dpr), Math.round((c.y - 13) * v.dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    })()`);
    const amber = ([r, g, b]) => r > 235 && g > 190 && g < 230 && b < 140;
    const cream = ([r, g, b]) => r > 230 && g > 215 && b > 185;
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    await page.sleep(400);
    check('nothing selected, the tags are cream', cream(await tagPixel(facts.single)), (await tagPixel(facts.single)).join());
    await page.evaluate(`window.trackBuilder.setSelection(['${facts.most}']), 1`);
    await page.sleep(500);
    const lit = await tagPixel(facts.most);
    const other = await tagPixel(facts.single);
    check('the piece selected has the pass in focus lit in amber', amber(lit), lit.join());
    check('and the tag of a piece the focus is not about is drawn back, and is not amber', !amber(other) && !cream(other), other.join());
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE FLY ORDER TOOL BUILDS A LAP FROM NOTHING, BY CLICKING THE PIECES IN THE ORDER
 * THEY ARE FLOWN. A click on a piece again is another pass through it, Backspace takes
 * the last pass off, Start over empties the order, and Escape puts the tool away. Every
 * click is one undo step, and none of it is a toast.
 */
kase('fly order', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      const put = (t, x, y) => { app.arm(t); app.placeAt({ x, y, z: 0 }); app.disarm(); };
      put('gate', 4.2, 5.2); put('gate', 5.8, 5.2); put('gate', 5.0, 7.0); put('pole', 5.0, 6.0);
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await page.sleep(400);
    const els = await json(page, "window.trackBuilder.doc.elements.map((e) => ({ id: e.id, type: e.type, x: e.position.x, y: e.position.y }))");
    const [g1, g2, g3, pole] = els;
    check('a lap of three gates and a pole is laid down in the order they were placed', (await seqIds(page)).length === 4);

    await key(page, 'KeyO');
    check('O arms the Fly order tool, and the coach says what a click does now', (await page.evaluate('window.trackBuilder.armed')) === 'route' && /Fly order/.test(await page.evaluate("document.getElementById('tb-coach').textContent")), await page.evaluate("document.getElementById('tb-coach').textContent"));
    /* With a tool in the hand a press is for the tool: the numbers and the marks let it through. */
    const lets = () => page.evaluate("(() => { const n = [...document.querySelectorAll('.tb-bubble, .tb-warnbadge')]; return n.length > 0 && n.every((x) => getComputedStyle(x).pointerEvents === 'none'); })()");
    /* Waited for, because the numbers are drawn a frame after the key is pressed and a
     * machine that is busy draws them late: the first full run on a loaded machine found
     * the list empty and called that a failure. A number that never lets a press through
     * still fails, after the wait. */
    await page.until("(() => { const n = [...document.querySelectorAll('.tb-bubble, .tb-warnbadge')]; return n.length > 0 && n.every((x) => getComputedStyle(x).pointerEvents === 'none'); })()", 3000).catch(() => {});
    check('with the tool armed the numbers and marks let a press through to the piece under them', await lets());
    const stepsS = await undoCount(page);
    const start = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-lapbar button')].find((x) => x.textContent === 'Start over'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    check('the lap bar has a Start over while there is an order', start != null);
    check('and nothing that can be pressed floats over the room in the coach, where it would take a tap meant for a piece', (await page.evaluate("document.querySelectorAll('#tb-coach button, #tb-coach a').length")) === 0);
    await click(page, start.x, start.y);
    check('Start over empties the order and keeps the pieces, as one undo step', (await seqIds(page)).length === 0 && (await elements(page)).length === 4 && (await undoCount(page)) === stepsS + 1);
    check('and the tool stays in the hand, with no Start over left to press on an empty order', (await page.evaluate('window.trackBuilder.armed')) === 'route'
      && !(await page.evaluate("[...document.querySelectorAll('#tb-lapbar button')].some((x) => x.textContent === 'Start over')")));

    const lap = [[g1, 0.4], [g2, 0.4], [pole, 0.9], [g2, 0.4], [g3, 0.4], [pole, 0.9], [g1, 0.4]];
    const stepsC = await undoCount(page);
    for (const [piece, z] of lap) {
      const spot = await screenOf(page, 'view3d', piece.x, piece.y, z);
      await click(page, spot.x, spot.y);
      await page.until('!window.trackBuilder.view3d.dirty', 10000);
    }
    const order = await json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)');
    check('seven clicks are seven passes, in the order they were clicked, a piece twice where it was clicked twice', order.join() === lap.map(([p]) => p.id).join(), order.join());
    check('each click is one undo step', (await undoCount(page)) === stepsC + 7, `${(await undoCount(page)) - stepsC} steps`);
    const last = await json(page, 'window.trackBuilder.doc.sequence[window.trackBuilder.doc.sequence.length - 1]');
    check('the last pass made is the one in focus', (await focusOf(page)) === last.id);
    const bar = await page.evaluate("document.getElementById('tb-lapbar').textContent");
    check('the lap bar says seven passes on four pieces', /Passes\s*7 on 4 pieces/.test(bar), bar.replace(/\s+/g, ' ').slice(0, 80));
    const tags = await json(page, `[...document.querySelectorAll('.tb-numtag')].map((t) => t.textContent.replace(/\\s+/g, ''))`);
    check('four tags, three of them counting two passes', tags.length === 4 && tags.filter((t) => /\u00d72/.test(t)).length === 3, tags.join(' '));

    await key(page, 'Backspace');
    await page.until('window.trackBuilder.doc.sequence.length === 6', 5000);
    check('Backspace takes the last pass off, and only it, and the tool stays armed', (await page.evaluate('window.trackBuilder.armed')) === 'route'
      && (await json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)')).join() === lap.slice(0, 6).map(([p]) => p.id).join());
    await key(page, 'KeyZ', 2);
    await page.until('window.trackBuilder.doc.sequence.length === 7', 5000);
    check('Control Z puts it back', true);

    /* Escape puts the tool away, and a click is then only a selection. */
    await key(page, 'Escape');
    check('Escape puts the tool away', (await page.evaluate('window.trackBuilder.armed')) === null);
    await page.sleep(300);
    check('and the numbers and marks take a press again', !(await lets()));
    const spot = await screenOf(page, 'view3d', g3.x, g3.y, 0.4);
    const stepsE = await undoCount(page);
    await click(page, spot.x, spot.y);
    check('and a click on a piece then only selects it', (await page.evaluate(`window.trackBuilder.selection.has('${g3.id}')`)) && (await seqIds(page)).length === 7 && (await undoCount(page)) === stepsE);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE SAME BY TOUCH, on a tablet: a tap on a chip looks at a pass, the card lists the passes
 * as chips a finger can press, Fly again is a tap, and the Fly order tool is a tap on its chip
 * and then a tap on each piece, put away by tapping the chip again because there is no Escape.
 */
kase('passes by touch', async () => {
  const page = await openBuilder('?class=micro', 1024, 768, { touch: true });
  try {
    await trapToasts(page);
    await loadPreset(page, 'racegow5-track8');
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    await page.sleep(700);
    const facts = await passFacts(page, `
      const tags = P.tagsOf(doc);
      const most = tags.reduce((a, t) => (t.passes.length > a.passes.length ? t : a), tags[0]);
      return { most: { elementId: most.elementId, passes: most.passes.map((p) => ({ seqId: p.seq.id, number: p.number })) } };`);
    const pole = facts.most;
    const third = pole.passes[2];
    const before = await seqIds(page);
    const steps = await undoCount(page);

    let at = await settled(page, chipOf(third.seqId), { scroll: true });
    await tap(page, at);
    await page.until(`window.trackBuilder.selection.has('${pole.elementId}')`, 5000);
    check('a tap on a chip selects its piece and puts that pass in focus, and is no edit', (await focusOf(page)) === third.seqId && (await undoCount(page)) === steps);
    const chipSize = await json(page, `[...document.querySelectorAll('.tb-strip .tb-chip')].map((c) => c.getBoundingClientRect().height)`);
    check('every chip on the strip is a finger tall', chipSize.length === before.length + 1 && chipSize.every((h) => h >= 43.5), `${Math.min(...chipSize)} px at the least`);

    await page.until("!document.getElementById('tb-card').hidden", 5000);
    const said = await page.evaluate("document.querySelector('#tb-card .tb-card-sub')?.textContent ?? ''");
    check('the touched card names the pass it is about and says how often the piece is flown, with no row of chips',
      new RegExp(`Flown 6 times, this is pass ${third.number}`).test(said) && !(await page.evaluate("!!document.querySelector('#tb-card .tb-card-passes')")), said);

    /* Another pass of the piece is a tap on its chip on the strip, and the card turns to it. */
    const fifth = pole.passes[4];
    const fifthChip = await settled(page, chipOf(fifth.seqId), { scroll: true });
    await tap(page, fifthChip);
    await page.until(`window.trackBuilder.focusedPass() === '${fifth.seqId}'`, 5000);
    await page.sleep(300);
    const said2 = await page.evaluate("document.querySelector('#tb-card .tb-card-sub')?.textContent ?? ''");
    check('a tap on another pass of the piece on the strip turns the card to it', new RegExp(`this is pass ${fifth.number}$`).test(said2), said2);

    /* Remove pass takes just that pass, and one Undo brings it back. */
    const rp = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Remove pass'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; })()`);
    check('the card has a Remove pass a finger tall', rp != null && rp.h >= 43.5, rp ? `${rp.h} px` : 'no such button');
    await tap(page, rp);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length - 1}`, 5000);
    check('and a tap on it takes that pass out, only that pass, and leaves the piece', (await seqIds(page)).join() === before.filter((q) => q !== fifth.seqId).join() && (await page.evaluate(`!!window.trackBuilder.doc.elements.find((e) => e.id === '${pole.elementId}')`)));
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length}`, 5000);
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.elementId}']), 1`);
    await page.sleep(600);

    const fly = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Fly again'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    check('the small bar of the card has Fly again on a touched screen', fly != null);
    await tap(page, fly);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length + 1}`, 5000);
    check('a tap on Fly again makes one more pass through the piece, in focus', (await page.evaluate('window.trackBuilder.doc.sequence.at(-1).elementId')) === pole.elementId && (await page.evaluate('window.trackBuilder.focusedPass() === window.trackBuilder.doc.sequence.at(-1).id')));
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length}`, 5000);

    /* Fly order: the chip on the strip arms it, a tap on a piece is a pass, the chip again puts it away. */
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(300);
    const add = await settled(page, '.tb-strip .tb-chip-add', { scroll: true });
    await tap(page, add);
    check('a tap on the plus chip arms Fly order', (await page.evaluate('window.trackBuilder.armed')) === 'route' && (await page.evaluate("document.querySelector('.tb-chip-add').classList.contains('on')")));
    const bar = await json(page, `(() => { const r = document.getElementById('tb-lapbar').getBoundingClientRect(); return r.top; })()`);
    const gates = await json(page, `window.trackBuilder.doc.elements.filter((e) => e.type === 'gate').map((e) => ({ id: e.id, x: e.position.x, y: e.position.y }))`);
    /* A gate that a tap on its middle picks as itself, clear of the bar: on a track this
     * close, a gate's middle can be the body of another piece in front of it. */
    let aim = null;
    for (const g of gates) {
      const p = await screenOf(page, 'view3d', g.x, g.y, 0.4);
      if (!p || !(p.x > 60 && p.x < 960 && p.y > 140 && p.y < bar - 60)) {
        continue;
      }
      const picked = await page.evaluate(`(() => { const h = window.trackBuilder.view3d.pickHit({ clientX: ${p.x}, clientY: ${p.y}, pointerType: 'touch' }); return h && !h.ring ? h.id : null; })()`);
      if (picked === g.id) {
        aim = { g, p };
        break;
      }
    }
    check('there is a gate in the room to tap, clear of the bar', aim != null);
    const stepsT = await undoCount(page);
    await tap(page, aim.p);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length + 1}`, 5000);
    check('a tap on a piece with the tool armed is one more pass through it, as one undo step, and the tool stays armed',
      (await page.evaluate('window.trackBuilder.doc.sequence.at(-1).elementId')) === aim.g.id && (await undoCount(page)) === stepsT + 1 && (await page.evaluate('window.trackBuilder.armed')) === 'route');
    const away = await settled(page, '.tb-strip .tb-chip-add', { scroll: true });
    await tap(page, away);
    check('and the plus chip again puts the tool away', (await page.evaluate('window.trackBuilder.armed')) === null);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* ------------------------------------------------------------------ */

/*
 * THE FURNITURE OF A ROOM. A table, a chair and a banner are on the palette after the
 * barrier, with an empty key chip because the letters ran out. They go down where the
 * pointer clicks, stand on the floor at a quarter turn, and the room draws each from the
 * boxes it is made of, so a click on a leg picks the table and a click where there is
 * only air under the top does not. They turn in quarter turns whatever is typed, and the
 * plan picks them where the room does.
 */
kase('furniture', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    const palette = await json(page, `[...document.querySelectorAll('#tb-palette .tb-tool')].map((b) => ({
      label: b.querySelector('.tb-tool-label').textContent,
      key: b.querySelector('.tb-tool-key').textContent,
      none: b.querySelector('.tb-tool-key').classList.contains('none'),
    }))`);
    const labels = palette.map((p) => p.label);
    const after = labels.indexOf('Barrier');
    check('the palette lists a table, a chair and a banner after the barrier and before the waypoint',
      labels.slice(after + 1, after + 4).join() === 'Table,Chair,Banner' && labels[after + 4] === 'Waypoint', labels.join());
    check('each with an empty key chip, and no word "undefined" anywhere on it',
      palette.slice(after + 1, after + 4).every((p) => p.key === '' && p.none)
      && !/undefined/.test(await page.evaluate("document.getElementById('tb-palette').textContent")));

    const boxCount = (id) => page.evaluate(`window.trackBuilder.view3d.pickables.filter((m) => m.userData.elementId === '${id}').length`);
    const floor = await screenOf(page, 'view3d', 5, 6, 0);
    await tool(page, 'Table');
    check('pressing Table arms it', (await page.evaluate('window.trackBuilder.armed')) === 'table');
    await mouse(page, 'mouseMoved', floor.x, floor.y, 0);
    await page.until('!!window.trackBuilder.view3d.ghostGroup', 5000).catch(() => {});
    check('the ghost under the pointer is a table: five boxes, not a slab', (await page.evaluate(`(() => {
      let n = 0;
      const g = window.trackBuilder.view3d.ghostGroup;
      if (g) g.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry') n += 1; });
      return n;
    })()`)) === 5);
    const steps = await undoCount(page);
    await click(page, floor.x, floor.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const table = (await elements(page)).find((e) => e.type === 'table');
    check('a click puts a table down where it was clicked, on the floor, at a quarter turn, as one undo step',
      Boolean(table) && Math.abs(table.x - 5) < 0.06 && Math.abs(table.y - 6) < 0.06 && table.z === 0
      && Math.abs(table.yaw / (Math.PI / 2) - Math.round(table.yaw / (Math.PI / 2))) < 1e-6 && (await undoCount(page)) === steps + 1,
      JSON.stringify(table));
    check('the tool stays armed for the next one, and Escape puts it away', (await page.evaluate('window.trackBuilder.armed')) === 'table');
    await key(page, 'Escape');
    check('Escape disarms it', (await page.evaluate('window.trackBuilder.armed')) == null);
    check('it is not a step in the flying order', (await page.evaluate('window.trackBuilder.doc.sequence.length')) === 0);

    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('chair');
      app.placeAt({ x: 7, y: 6, z: 0 });
      app.arm('banner');
      app.placeAt({ x: 5, y: 8, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const list = await elements(page);
    const chair = list.find((e) => e.type === 'chair');
    const banner = list.find((e) => e.type === 'banner');
    check('the room draws each from its boxes: five for the table, six for the chair, three for the banner',
      (await boxCount(table.id)) === 5 && (await boxCount(chair.id)) === 6 && (await boxCount(banner.id)) === 3,
      `${await boxCount(table.id)}, ${await boxCount(chair.id)}, ${await boxCount(banner.id)}`);

    /* Where a click lands. The table's own boxes, in the room's frame. */
    const bits = JSON.parse(await page.evaluate(`(async () => {
      const { roomBoxes } = await import('/src/props/room.js');
      const el = window.trackBuilder.doc.elements.find((e) => e.id === '${table.id}');
      return JSON.stringify({ boxes: roomBoxes('table', el.dims), at: el.position, dims: el.dims });
    })()`));
    const leg = bits.boxes.find((b) => b.name === 'table leg');
    const legAt = await screenOf(page, 'view3d', table.x + (leg.lo[0] + leg.hi[0]) / 2, table.y + (leg.lo[1] + leg.hi[1]) / 2, 0.3);
    await click(page, legAt.x, legAt.y);
    check('a click on a leg picks the table', await page.evaluate(`window.trackBuilder.selection.has('${table.id}')`));
    check('and the card names it', await page.evaluate("/Table/.test(document.getElementById('tb-card').textContent)"),
      await page.evaluate("document.getElementById('tb-card').textContent.slice(0, 80)"));
    const dimFields = await json(page, `[...document.querySelectorAll('#tb-inspector [data-tbkey^="dim-"]')].map((i) => i.dataset.tbkey.split('-').pop())`);
    check('the inspector offers a width, a depth and a height and nothing else', dimFields.join() === 'width,depth,height', dimFields.join());
    const sized = await json(page, `[...document.querySelectorAll('#tb-inspector [data-tbkey^="dim-"]')].map((i) => ({ min: i.min, max: i.max }))`);
    check('each held to what a room can have', sized.every((f) => Number(f.min) === 0.05 && Number(f.max) === 6), JSON.stringify(sized));

    /* Turning. Q turns a quarter and typing a heading snaps to one, and says why once. */
    const yawOf = async () => (await elements(page)).find((e) => e.id === table.id).yaw;
    const y0 = await yawOf();
    await key(page, 'KeyQ');
    check('Q turns it a quarter', Math.abs(Math.abs((await yawOf()) - y0) - Math.PI / 2) < 1e-4, `${y0} then ${await yawOf()}`);
    const typeYaw = async (deg) => {
      await page.evaluate(`(() => {
        const i = document.querySelector('#tb-inspector [data-tbkey="yaw-${table.id}"]');
        i.value = '${deg}';
        i.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
      })()`);
      await page.sleep(200);
    };
    await typeYaw(40);
    check('a heading of 40 degrees typed in is the nearest quarter, 0', Math.abs(await yawOf()) < 1e-6, String(await yawOf()));
    check('and the page says why, once, in words about furniture and not about buildings',
      (await toasts(page)).length === 1 && /table, a chair or a banner turns in quarter turns/.test((await toasts(page))[0]) && !/Buildings/.test((await toasts(page))[0]), (await toasts(page)).join(' | '));
    await typeYaw(90);
    check('90 degrees is a quarter', Math.abs((await yawOf()) - Math.PI / 2) < 1e-4);

    /* The room draws it turned: its long side now runs along y, so a point half a metre
     * along y at the height of the top is the table and, before the turn, was air. */
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    await page.sleep(150);
    const topHeight = bits.dims.height - 0.02;
    const along = await screenOf(page, 'view3d', table.x, table.y + 0.5, topHeight);
    await click(page, along.x, along.y);
    check('turned a quarter, a click half a metre along y at the height of the top picks the table',
      await page.evaluate(`window.trackBuilder.selection.has('${table.id}')`));
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    const before = await screenOf(page, 'view3d', table.x + 0.5, table.y, topHeight);
    await click(page, before.x, before.y);
    check('and half a metre along x at that height, where the top was before the turn, is air and picks nothing',
      await page.evaluate("window.trackBuilder.selection.size === 0"));

    /* The plan picks it where the room does. */
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(300);
    const planAlong = await screenOf(page, 'view2d', table.x, table.y + 0.5);
    await click(page, planAlong.x, planAlong.y);
    check('on the plan, a click half a metre along y picks it too', await page.evaluate(`window.trackBuilder.selection.has('${table.id}')`));
    const planOff = await screenOf(page, 'view2d', table.x + 0.5, table.y);
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    await click(page, planOff.x, planOff.y);
    check('and half a metre along x, where it was before the turn, picks nothing', await page.evaluate("window.trackBuilder.selection.size === 0"));
    const px = await page.evaluate(`(() => {
      const v = window.trackBuilder.view2d;
      const r = v.canvas.getBoundingClientRect();
      const p = v.toScreen({ x: ${table.x}, y: ${table.y + 0.3} });
      const c = v.canvas.getContext('2d');
      const d = c.getImageData(Math.round(p.x * (v.canvas.width / r.width)), Math.round(p.y * (v.canvas.height / r.height)), 1, 1).data;
      return [d[0], d[1], d[2]];
    })()`);
    check('the plan draws the top of it in the obstacle colour: red in it well above blue', px[0] > px[2] + 40, px.join());

    /* The board does not know them yet, so Publish says so and opens no form. */
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 4, y: 5, z: 0 });
      app.disarm();
      return 1;
    })()`);
    await page.evaluate('window.trackBuilder.publishBtn.click(), 1');
    await page.sleep(250);
    const said = await json(page, `(() => {
      const m = document.getElementById('tb-modal');
      return { open: !m.hidden, title: m.querySelector('h2')?.textContent ?? '', text: m.textContent, inputs: m.querySelectorAll('input').length };
    })()`);
    check('Publish on a track with a table in it says the board does not know them yet, in a dialog, and asks for nothing',
      said.open && said.title === 'Not on the board yet' && /does not know a table, a chair or a banner/.test(said.text) && /This one has 1 table, 1 chair and 1 banner/.test(said.text) && said.inputs === 0,
      JSON.stringify(said));
    await page.evaluate("document.querySelector('#tb-modal .tb-btn').click(), 1");
    await page.sleep(150);
    check('and closes', await page.evaluate("document.getElementById('tb-modal').hidden"));

    /* Delete and undo. */
    await page.evaluate("window.trackBuilder.setMode('3d'), 1");
    await page.sleep(300);
    await page.evaluate(`window.trackBuilder.setSelection(['${table.id}']), 1`);
    /* The dialog's button was pressed and has gone, and a key goes where the focus was. */
    await page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1');
    const count = (await elements(page)).length;
    await key(page, 'Delete');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('Delete removes it, boxes and all', (await elements(page)).length === count - 1 && (await boxCount(table.id)) === 0,
      `${count} elements, then ${(await elements(page)).length}, ${await boxCount(table.id)} boxes drawn`);
    await key(page, 'KeyZ', 2);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('and Control Z puts it back, drawn again', (await elements(page)).length === count && (await boxCount(table.id)) === 5);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

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
