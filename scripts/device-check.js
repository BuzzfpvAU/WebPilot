/*
 * device-check.js: the menus work on a phone and a tablet, not only a laptop.
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
 * WHY THIS IS A SEPARATE CHECK FROM shell-check.js.
 *
 * That one measures ONE window, records a per screen overflow budget and
 * fails when a budget grows. It is the right shape for "did this change
 * cost list", and it is blind to the whole class of defect this file is
 * about, because every one of those defects is invisible at 1600 by 900.
 *
 * What was actually found the first time this ran, all of it real:
 *
 *   the Race room's rows sat 8 px off the right of every phone and tablet,
 *   because a stage sized in vw is wider than the padded box holding it;
 *   the help column, the single reason a person can learn an FPV sim here,
 *   was entirely below the fold on a phone on Quad, Pilot and Paused;
 *   the title's row list had no height cap at all on a narrow window, so
 *   Report bug could not be reached by any amount of scrolling;
 *   the pause menu put Quit to title 242 px below a 720 px window with no
 *   scroller, so a pilot who paused a run could not quit it.
 *
 * WHAT IT ASSERTS, and the one thing it deliberately does not.
 *
 * Reachability, not position. A screen is allowed to put content below the
 * fold as long as a person can scroll to it: the Freestyle room's four
 * world cards do exactly that on a phone and are fine. So every assertion
 * scrolls the thing into view the way a person would, and then asks
 * whether it is visible. Anything still off screen after that is lost.
 *
 * Touch emulation is on, so `pointer: coarse` matches and the 44 px target
 * rule is actually exercised rather than assumed.
 */

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { presetsForClass } from '../src/trackbuilder/presets.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * Real devices, in both orientations, plus the smallest phone still worth
 * supporting. 390 by 844 is an iPhone 14, 820 by 1180 an iPad Air, and
 * 360 by 640 is the floor: below that a menu is not the problem.
 */
const DEVICES = [
  ['phone portrait', 390, 844],
  ['phone landscape', 844, 390],
  ['tablet portrait', 820, 1180],
  ['tablet landscape', 1180, 820],
  ['small phone', 360, 640],
];

const SCREENS = [
  'title', 'courses', 'freestyle', 'quad', 'pilot', 'launch',
  'rates', 'pids', 'fc', 'paused', 'results', 'howto', 'credits',
  /* Stick help, 28 September. Most of the pilots it is for are on phones:
   * nine of the stick tickets it answers came from one. */
  'stickhelp',
];

/* Apple's and Google's guidance agree on 44, and the shell already has a
 * `pointer: coarse` block written to it. This is what proves it applies. */
const MIN_TAP = 44;

const PROBE = `(() => {
  const ui = window.__ui;
  /* Answer the gate, because this check is about the returning pilot's
   * menus rather than the one question in front of them,
   * and clear the first run so the primary row is Fly rather than the guided
   * First flight. Set rather than pressed: act() would navigate, and this
   * walk shows every screen itself. */
  ui.firstRun = false;
  if (!ui.mode) { ui.mode = 'race'; }
  const W = window.innerWidth;
  const H = window.innerHeight;
  const out = { coarse: matchMedia('(pointer: coarse)').matches, screens: {} };

  for (const name of ${JSON.stringify(SCREENS)}) {
    const bad = [];
    try {
      ui.show(name);
      /* Put the cursor on a row that HAS a note, or the help column is
       * empty and its position proves nothing. */
      const items = ui.items();
      const i = items.findIndex((it) => it && it.note && ui.isStop(it));
      if (i >= 0) { ui.setCursor(i); }

      const rows = ui.menuRows.filter((r) => {
        const b = r.getBoundingClientRect();
        return b.width > 0 || b.height > 0;
      });

      /* Nothing off the side, ever. There is no horizontal scrollbar on a
       * phone to find it with. */
      for (const r of rows) {
        const b = r.getBoundingClientRect();
        if (b.right > W + 1 || b.left < -1) {
          bad.push('a row is off the side of the window');
          break;
        }
      }
      if (document.documentElement.scrollWidth > W + 1) {
        bad.push('the page scrolls sideways');
      }

      /* Every stop reachable by scrolling. */
      const stops = rows.filter((r) => r.classList.contains('row'));
      for (const r of [stops[0], stops[stops.length - 1]]) {
        if (!r) { continue; }
        r.scrollIntoView({ block: 'nearest' });
        const b = r.getBoundingClientRect();
        if (b.top >= H - 4 || b.bottom > H + 4) {
          bad.push('a row cannot be scrolled into view: ' + r.textContent.trim().slice(0, 30));
          break;
        }
      }

      /* The help column is the reason a person can learn this. If it has
       * something to say it has to be possible to read it. */
      const scr = ui.screens[name];
      const help = scr ? scr.querySelector('.menu-help') : null;
      if (help && help.textContent.trim()) {
        help.scrollIntoView({ block: 'nearest' });
        const b = help.getBoundingClientRect();
        if (b.top >= H - 4) {
          bad.push('the help column cannot be reached');
        } else if (b.bottom > H + 4) {
          bad.push('the help column is cut off by ' + Math.round(b.bottom - H) + 'px after scrolling');
        }
      }

      /* Touch targets. The bench keeps its own denser rows on purpose and
       * is measured separately below. */
      if (name !== 'fc') {
        let min = 999;
        let worst = '';
        for (const r of stops) {
          const b = r.getBoundingClientRect();
          if (b.height > 0 && b.height < min) {
            min = Math.round(b.height);
            worst = r.textContent.trim().slice(0, 24);
          }
        }
        if (min !== 999 && min < ${MIN_TAP}) {
          bad.push('a ' + min + 'px tap target: ' + worst);
        }
      }
    } catch (e) {
      bad.push('threw: ' + (e && e.message ? e.message : e));
    }
    out.screens[name] = bad;
  }
  ui.show('title');
  return JSON.stringify(out);
})()`;

async function run(label, w, h) {
  const page = await openPage({
    root,
    width: w,
    height: h,
    /* Without this `pointer: coarse` never matches and the 44 px rule is
     * asserted against a layout no phone will ever see. */
    touch: 1,
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = 'low';
      s.graphicsAuto = false;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused. The run still boots. */ }`],
  });
  try {
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);
    const data = JSON.parse(await page.evaluate(PROBE));
    return { label, w, h, ...data };
  } finally {
    await page.close();
  }
}

/*
 * THE BUILDER'S TOP BAR, ON A LAPTOP. Not a phone defect, and here all the
 * same, because it is the same defect this file exists for: a control a
 * person cannot reach. On the race canvas the bar's three zones need about
 * 1944 px on one row, and until fitTopBar wrapped it, Undo, Redo, 2D, Labels
 * and Sponsor logos sat clipped under the other two zones at 1440 and 1600,
 * and Undo and Sponsor logos were still cut at 1920. Every visible control
 * on the bar is hit tested at its two ends and its middle: the point has to
 * land on the control, not on a neighbour or on nothing.
 */
const BUILDER_WINDOWS = [
  ['race canvas', 'race', 1440, 900],
  ['race canvas', 'race', 1600, 900],
  ['race canvas', 'race', 1920, 1080],
  ['freestyle canvas', 'freestyle', 1440, 900],
];

const BAR_PROBE = `(() => {
  const bar = document.getElementById('tb-topbar');
  if (!bar) { return JSON.stringify({ bad: ['no top bar'] }); }
  const bad = [];
  let seen = 0;
  for (const c of bar.querySelectorAll('button, a, input')) {
    const b = c.getBoundingClientRect();
    if (b.width < 2 || b.height < 2 || getComputedStyle(c).visibility === 'hidden') { continue; }
    if (c.closest('.tb-more-menu')) { continue; }
    seen += 1;
    const y = b.top + b.height / 2;
    for (const x of [b.left + 3, b.left + b.width / 2, b.right - 3]) {
      const e = document.elementFromPoint(x, y);
      if (!(e && (e === c || c.contains(e)))) {
        bad.push((c.textContent || c.value || c.className).trim().slice(0, 24)
          + ' is covered at x ' + Math.round(x) + (e ? ' by ' + (e.textContent || e.className).trim().slice(0, 24) : ''));
        break;
      }
    }
  }
  if (seen < 10) { bad.push('only ' + seen + ' controls on the bar'); }
  return JSON.stringify({ bad, seen });
})()`;

/*
 * THE WHOOP ROOM, ON A TABLET. A track is built standing in the hall it is for,
 * and the room is the tool there (WHOOP-BUILDER-PLAN.md, 3.2), so it has to work
 * with fingers on a screen of about 1000 px: the drawing has to be most of the
 * screen, the page must not take the touches, every tool has to be reachable and
 * finger sized, and the card a tap on a gate brings up has to leave the room and
 * the piece it is about visible. Touch emulation is on, so `pointer: coarse`
 * matches and the sizes that rule asks for are the ones measured.
 */
const WHOOP_WINDOWS = [
  ['tablet portrait', 820, 1180],
  ['tablet landscape', 1024, 768],
  ['tablet landscape, large', 1180, 820],
];

const WHOOP_PROBE = `(async () => {
  const bad = [];
  const app = window.trackBuilder;
  const box = (n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  if (!matchMedia('(pointer: coarse)').matches) { bad.push('pointer: coarse did not match, so the touch sizes were not exercised'); }
  const stage = box(document.getElementById('tb-stage'));
  if (stage.w < innerWidth * 0.55) { bad.push('the drawing is only ' + Math.round(stage.w) + ' px of ' + innerWidth + ' across'); }
  if (stage.h < innerHeight * 0.4) { bad.push('the drawing is only ' + Math.round(stage.h) + ' px of ' + innerHeight + ' high'); }
  const cv = document.getElementById('tb-3d');
  if (getComputedStyle(cv).touchAction !== 'none') { bad.push('the room does not take the touches itself (touch-action ' + getComputedStyle(cv).touchAction + ')'); }
  const { PRESETS } = await import('/src/trackbuilder/presets.js');
  app.loadDocument(JSON.parse(JSON.stringify(PRESETS.find((p) => p.id === 'racegow5-track6'))), '');
  await new Promise((r) => setTimeout(r, 1200));

  /* Every tool on the palette can be brought into view by scrolling it, and is finger sized. */
  const tools = [...document.querySelectorAll('#tb-palette .tb-tool')];
  if (tools.length < 12) { bad.push('only ' + tools.length + ' tools on the palette'); }
  for (const t of tools) {
    t.scrollIntoView({ block: 'nearest' });
    const b = box(t);
    const e = document.elementFromPoint((b.l + b.r) / 2, (b.t + b.b) / 2);
    const name = (t.textContent || '').trim().slice(0, 22);
    if (!(e && (e === t || t.contains(e)))) { bad.push('the tool ' + name + ' is covered after scrolling to it'); }
    if (b.h < 43.5) { bad.push('the tool ' + name + ' is ' + Math.round(b.h) + ' px tall, less than a finger'); }
  }
  document.getElementById('tb-palette').scrollTop = 0;

  /* The card that a tap on a gate brings up. */
  const gate = app.doc.elements.find((e) => e.type === 'gate');
  app.setSelection([gate.id]);
  await new Promise((r) => setTimeout(r, 900));
  const card = document.getElementById('tb-card');
  if (card.hidden) {
    bad.push('selecting a gate did not bring up its card');
  } else {
    const c = box(card);
    if (c.l < stage.l - 0.5 || c.r > stage.r + 0.5 || c.t < stage.t - 0.5 || c.b > stage.b + 0.5) { bad.push('the card is not inside the drawing: ' + JSON.stringify([c, stage].map((q) => [q.l, q.t, q.r, q.b].map(Math.round)))); }
    if (c.h > stage.h * 0.45) { bad.push('the card is ' + Math.round(c.h) + ' px of a ' + Math.round(stage.h) + ' px drawing, and covers the track it is for'); }
    const lap = box(document.getElementById('tb-lapbar'));
    if (c.l < lap.r && c.r > lap.l && c.t < lap.b && c.b > lap.t) { bad.push('the card sits on the lap bar'); }
    for (const b of card.querySelectorAll('button')) {
      const q = box(b);
      if (q.h < 43.5) { bad.push('the card button ' + (b.textContent || '').trim().slice(0, 16) + ' is ' + Math.round(q.h) + ' px tall, less than a finger'); }
    }
    for (const w of ['Turn', 'Reverse', 'Copy', 'Remove', 'More']) {
      const b = [...card.querySelectorAll('button')].find((x) => x.textContent === w);
      if (!b) { bad.push('the card has no ' + w + ' button, which a touch screen has no key for'); }
    }
    if (!card.querySelector('[data-tbkey="card-replace"]')) { bad.push('the card has no Replace with'); }
    /* The piece is not under it. */
    const v = app.view3d;
    v.applyCamera(); v.camera.updateMatrixWorld(true); v.root.updateMatrixWorld(true);
    const p = new v.camera.position.constructor(gate.position.x, gate.position.y, 0.35);
    v.root.localToWorld(p); p.project(v.camera);
    const r = cv.getBoundingClientRect();
    const px = r.left + ((p.x + 1) / 2) * r.width;
    const py = r.top + ((1 - p.y) / 2) * r.height;
    const under = document.elementFromPoint(px, py);
    if (under && card.contains(under)) { bad.push('the card is on top of the gate it is about'); }
  }

  /* The bar along the foot, the numbers and the marks. */
  for (const b of document.querySelectorAll('#tb-lapbar button')) {
    const q = box(b);
    if (q.h < 43.5) { bad.push('the lap bar button is ' + Math.round(q.h) + ' px tall'); }
  }
  for (const n of document.querySelectorAll('.tb-bubble, .tb-warnbadge')) {
    const q = box(n);
    if (n.style.display !== 'none' && q.w < 29.5) { bad.push('a number or a mark is ' + Math.round(q.w) + ' px across'); break; }
  }

  /* More opens the drawer, and its fields are finger sized and inside the screen. */
  const more = [...card.querySelectorAll('button')].find((x) => x.textContent === 'More');
  if (more) { more.click(); }
  await new Promise((r) => setTimeout(r, 500));
  const side = box(document.getElementById('tb-side'));
  if (side.r > innerWidth + 1 || side.b > innerHeight + 1 || side.l < 0) { bad.push('the drawer runs off the screen'); }
  const fields = [...document.querySelectorAll('#tb-inspector input')].filter((n) => n.getBoundingClientRect().width > 2);
  if (fields.length < 3) { bad.push('the drawer shows only ' + fields.length + ' inspector fields'); }
  for (const f of fields) {
    if (box(f).h < 39.5) { bad.push('a field in the drawer is ' + Math.round(box(f).h) + ' px tall'); break; }
  }
  return JSON.stringify({ bad, tools: tools.length });
})()`;

/*
 * THE FREESTYLE RESULTS PAGE, ON A LAPTOP. The lettering's five panel
 * fixture has four kinds of trick, which is three rows and a "more" line.
 * At 1280 by 720 the copy column used to run under the menu, and Fly again
 * was drawn over the third row and over the best line; at 1600 by 900 over
 * the note. So: the copy stops at the menu, every row is above the fold of
 * the copy, the note leads with the best line and its first line is above
 * that fold too, and the kicker is clear of the status bar.
 */
const RESULTS_WINDOWS = [[1280, 720], [1600, 900]];

const RESULTS_PROBE = `(async () => {
  const m = await window.__lettering.demo();
  window.__lettering.results(m.demoSummary('full'));
  await new Promise((r) => setTimeout(r, 600));
  const scr = document.querySelector('.screen-results');
  for (const a of scr.getAnimations({ subtree: true })) { a.finish(); }
  const top = scr.querySelector('.results-top');
  const menu = scr.querySelector('.menu');
  const bad = [];
  const tb = top.getBoundingClientRect();
  const mb = menu.getBoundingClientRect();
  const fold = Math.min(tb.bottom, mb.top);
  const spill = top.scrollHeight - top.clientHeight;
  if (tb.bottom > mb.top + 1) {
    bad.push('the copy runs ' + Math.round(tb.bottom - mb.top) + ' px under the menu');
  } else if (spill > 1 && getComputedStyle(top).overflowY === 'visible') {
    bad.push('the copy spills ' + spill + ' px out of its box, under the menu');
  }
  const rows = [...scr.querySelectorAll('.results .result-row')];
  if (rows.length !== 4) {
    bad.push('the fixture drew ' + rows.length + ' rows, not three and a more line');
  }
  for (const r of rows) {
    if (r.getBoundingClientRect().bottom > fold + 1) {
      bad.push('a row is below the fold of the copy: ' + r.textContent.trim().slice(0, 24));
      break;
    }
  }
  const note = scr.querySelector('.results-note');
  const nb = note.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(note).lineHeight) || 21;
  if (!/^Your best/.test(note.textContent)) {
    bad.push('the note does not lead with the best line');
  } else if (nb.top + line > fold + 1) {
    bad.push('the best line is ' + Math.round(nb.top + line - fold) + ' px below the fold of the copy');
  }
  const bar = document.querySelector('.frame-top');
  const kick = scr.querySelector('.results-kicker').getBoundingClientRect();
  if (bar && kick.top < bar.getBoundingClientRect().bottom - 1) {
    bad.push('the kicker is under the status bar');
  }
  return JSON.stringify({ bad });
})()`;

async function runResults(w, h) {
  const page = await openPage({ root, width: w, height: h });
  try {
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__lettering', 10000);
    return JSON.parse(await page.evaluate(RESULTS_PROBE));
  } finally {
    await page.close();
  }
}

/*
 * THE FLIGHT OSD, ON A PHONE HELD SIDEWAYS (POLISH-PLAN.md item 14). With
 * the thumb sticks up the OSD used to stack pack, speed, height, throttle
 * and the Weight slider in one centre column, up to about 270 px of a 390 px
 * screen, and the launch banner landed on the lap clock. Flown three
 * times on each case:
 *
 *   on the pads, with the launch prompt up and the Weight slider out;
 *   in the air, where the slider is gone;
 *   paused, where the Weight is a menu row whose track a thumb can reach,
 *   and the overlay's slider is not drawn through the menu.
 *
 * The cases are the widest lines and the tallest clock. Hibari Yard, the
 * shipped freestyle map, on the five inch, whose right corner carries the
 * speed as well as the height and whose launch prompt has the longest
 * second line; at the survey's phone and at the narrowest one pictured.
 * And a race, through the Race room and the launch card, on the first
 * shipped track, which is a whoop track, so on the whoop as input-check
 * flies it: the lap clock with its gate line under it is the tallest the
 * clock gets before the banner has to hang below it, on the shortest
 * phone pictured.
 *
 * Asserted every time in flight: nothing drawn by the OSD or the banner
 * reaches into the centre third of the picture (the middle third of the
 * width AND of the height, the gate's cell; the target mark is the one
 * thing meant to sit on the gate and is not counted), nothing of the OSD
 * lies on a thumb plate, each corner is one line in its own outer third
 * along the top, the banner hangs below the lap clock, the bug chip and
 * the music dock are away, and Pause is up and takes a touch at its middle:
 * shown on the pads, faded after about three seconds in the air (item 12)
 * and still taking the touch.
 */
const FLIGHT_CASES = [
  ['yard', 844, 390],
  ['yard', 740, 360],
  ['race', 740, 360],
];

const FLIGHT_TRACK = {
  ...presetsForClass('micro')[0],
  id: 'trk-d3v1ce14',
  name: 'Phone OSD check track',
  modifiedUtc: '2026-09-26T00:00:00.000Z',
};

const FLIGHT_PROBE = (stage) => `(() => {
  const stage = ${JSON.stringify(stage)};
  const ui = window.__ui;
  const W = innerWidth;
  const H = innerHeight;
  const bad = [];
  const shown = (n) => {
    for (let p = n; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) { return false; }
    }
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const meets = (a, b) => a.right > b.left + 0.5 && a.left < b.right - 0.5 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5;
  const name = (n) => (String(n.className || n.tagName) + ' ' + (n.textContent || '').trim().slice(0, 18)).trim();
  const touches = (n) => {
    const r = n.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(e && (e === n || n.contains(e)));
  };
  const q = (s) => document.querySelector(s);
  const air = q('.osd-air-row');
  const range = q('.osd-air-range');
  const bug = ui.bugChip;
  if (stage === 'paused') {
    if (ui.screen !== 'paused') { bad.push('the pause screen is not up'); }
    /* The Weight is the menu's own row here, and the overlay's slider is
     * put away under the dimmed OSD rather than shown out of reach. */
    const row = ui.menuRows.find((r) => r.dataset.rowId && /weight/.test(r.dataset.rowId));
    const track = row && row.querySelector('input[type=range]');
    if (!track) {
      bad.push('there is no Weight row with a track on the pause screen');
    } else {
      row.scrollIntoView({ block: 'nearest' });
      if (!touches(track)) { bad.push('the Weight row\\'s track cannot be touched on the pause screen'); }
    }
    if (air && shown(air)) { bad.push('the overlay\\'s Weight slider shows through the pause menu'); }
    if (!shown(bug)) { bad.push('the bug chip is not on the pause screen'); }
    return JSON.stringify({ bad });
  }
  if (!document.getElementById('ui').classList.contains('touch-fly-on')) {
    bad.push('the thumb sticks are not up');
    return JSON.stringify({ bad });
  }
  const cell = { left: W / 3, right: (2 * W) / 3, top: H / 3, bottom: (2 * H) / 3 };
  const plates = [...document.querySelectorAll('.touch-gimbal')].map((n) => n.getBoundingClientRect());
  const bannerUp = ui.banner.style.opacity === '1' && ui.banner.textContent.trim() !== '';
  /* What is drawn: a leaf, or a node with text of its own, the reading the
   * lettering's centre() takes, plus the bars and the slider's track. */
  const drawn = [...document.querySelectorAll('.osd *')].filter((n) => {
    if (n.closest('.lock')) { return false; }
    const own = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (n.childElementCount && !own && !n.matches('.bar, input')) { return false; }
    return shown(n);
  });
  if (bannerUp) { drawn.push(ui.banner); }
  for (const n of drawn) {
    const r = n.getBoundingClientRect();
    if (meets(r, cell)) { bad.push(name(n) + ' is in the centre third, at ' + Math.round(r.left) + ',' + Math.round(r.top)); }
    if (n !== ui.banner && plates.some((p) => meets(r, p))) { bad.push(name(n) + ' is on a thumb plate'); }
  }
  const pause = q('.touch-pause');
  const pr = pause && shown(pause) ? pause.getBoundingClientRect() : null;
  if (!pr) {
    bad.push('Pause is not up');
  } else if (!touches(pause)) {
    bad.push('Pause does not take a touch at its middle');
  }
  if (shown(bug)) { bad.push('the bug chip is up in flight'); }
  if (ui.musicDock && shown(ui.musicDock)) { bad.push('the music dock is up in flight'); }
  for (const [sel, side] of [['.osd-left', 'left'], ['.osd-right', 'right']]) {
    const n = q(sel);
    const r = n.getBoundingClientRect();
    if (r.height > 26) { bad.push('the ' + side + ' corner is ' + Math.round(r.height) + ' px tall, not one line'); }
    if (r.top > H / 8) { bad.push('the ' + side + ' corner is not along the top, at ' + Math.round(r.top)); }
    if (side === 'left' ? r.right > cell.left : r.left < cell.right) { bad.push('the ' + side + ' corner reaches into the middle third of the width'); }
    if (pr && meets(r, pr)) { bad.push('the ' + side + ' corner is under Pause'); }
  }
  const clock = q('.osd-top').getBoundingClientRect();
  if (bannerUp && ui.banner.getBoundingClientRect().top < clock.bottom - 0.5) {
    bad.push('the banner is over the lap clock');
  }
  if (stage === 'pads') {
    if (!bannerUp) { bad.push('the launch prompt is not up on the pads'); }
    if (!air || !shown(air)) {
      bad.push('the Weight slider is not up on the ground');
    } else if (!touches(range)) {
      bad.push('the Weight slider cannot be touched on the ground');
    }
  }
  if (stage === 'air' && air && shown(air)) { bad.push('the Weight slider is up in the air'); }
  /* The chips fade after about three seconds in the air (item 12), and
   * Pause, faded, still takes the touch above. On the pads they are up. */
  const quiet = document.getElementById('ui').classList.contains('chips-quiet');
  if (stage === 'air' && !quiet) { bad.push('Pause has not faded after three seconds in the air'); }
  if (stage === 'pads' && (quiet || (pause && Number(getComputedStyle(pause).opacity) < 1))) {
    bad.push('Pause is faded on the pads');
  }
  return JSON.stringify({ bad });
})()`;

async function runFlight(kind, w, h) {
  const race = kind === 'race';
  const page = await openPage({
    root,
    width: w,
    height: h,
    touch: 1,
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = 'low';
      s.graphicsAuto = false;
      s.airframe = ${JSON.stringify(race ? 'whoop65' : '5inch')};
      ${race ? '' : "s.map = 'built';"}
      localStorage.setItem(k, JSON.stringify(s));
      ${race ? `localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify({ [FLIGHT_TRACK.id]: FLIGHT_TRACK }))});` : ''}
      /* The Weight card is its own once in a browser's life, and not the
       * layout this measures. */
      localStorage.setItem('webfpv.airhint.v2', '1');
    } catch (e) { /* Storage refused. The flight then fails to start, and says so. */ }`],
  });
  const out = {};
  try {
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);
    if (race) {
      await page.evaluate(`(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = 'race';
        ui.show('courses'); ui.act('local:${FLIGHT_TRACK.id}'); return 1; })()`);
      await page.until("(() => { const m = window.__map(); return m.id === 'custom' && m.ready && m.mode !== 'freestyle' && m.gates > 0; })()", 90000);
      await page.evaluate("window.__ui.act('fly'), 1");
      await page.until("window.__ui.screen === 'launch'", 20000);
      await page.tap('Enter');
    } else {
      await page.until("(() => { const m = window.__map(); return m.id === 'built' && m.ready; })()", 120000);
      await page.evaluate(`(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = 'freestyle';
        ui.show('title'); ui.act('fly'); return 1; })()`);
    }
    await page.until("window.__ui.screen === 'flight' && window.__craftState().mode === 'flight' && document.getElementById('ui').classList.contains('touch-fly-on')", 60000);
    await page.sleep(1500);
    out.pads = JSON.parse(await page.evaluate(FLIGHT_PROBE('pads'))).bad;
    await page.evaluate('window.__stick(0, 0, 0, 0.62), 1');
    await page.sleep(2500);
    await page.evaluate('window.__stick(0, 0, 0, 0.42), 1');
    /* The fade is 0.6 s late and 0.8 s long, then visibility follows. */
    await page.until("getComputedStyle(document.querySelector('.osd-air-row')).visibility === 'hidden'", 10000).catch(() => {});
    await page.until("document.getElementById('ui').classList.contains('chips-quiet')", 10000).catch(() => {});
    out.air = JSON.parse(await page.evaluate(FLIGHT_PROBE('air'))).bad;
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
    await page.sleep(600);
    out.paused = JSON.parse(await page.evaluate(FLIGHT_PROBE('paused'))).bad;
  } catch (e) {
    out.flow = [`the flow did not reach flight: ${e.message}`];
  } finally {
    await page.close();
  }
  return out;
}

async function runBuilder(label, mode, w, h) {
  const page = await openPage({ root, width: w, height: h, url: `/src/trackbuilder/index.html?mode=${mode}` });
  try {
    await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    await page.sleep(1200);
    return JSON.parse(await page.evaluate(BAR_PROBE));
  } finally {
    await page.close();
  }
}

async function runWhoop(label, w, h) {
  const page = await openPage({ root, width: w, height: h, url: '/src/trackbuilder/index.html?class=micro', touch: true });
  try {
    await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    await page.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer", 60000).catch(() => {});
    await page.sleep(800);
    const top = JSON.parse(await page.evaluate(BAR_PROBE));
    const room = JSON.parse(await page.evaluate(WHOOP_PROBE));
    return { bad: [...top.bad.map((b) => `top bar: ${b}`), ...room.bad], tools: room.tools, seen: top.seen };
  } finally {
    await page.close();
  }
}

async function main() {
  const failures = [];
  console.log('device check: every screen, on a phone and a tablet\n');
  for (const [label, w, h] of DEVICES) {
    const r = await run(label, w, h);
    const broken = Object.entries(r.screens).filter(([, v]) => v.length);
    const where = `${label} ${w}x${h}`;
    if (!r.coarse) {
      failures.push(`${where}: pointer: coarse did not match, so the touch rules were not exercised`);
    }
    console.log(`  ${where.padEnd(26)} ${broken.length ? `${broken.length} screen(s) with problems` : 'all clear'}`);
    for (const [screen, list] of broken) {
      for (const problem of list) {
        failures.push(`${where} ${screen}: ${problem}`);
      }
    }
  }

  console.log('\nthe track builder\'s top bar, on a laptop\n');
  for (const [label, mode, w, h] of BUILDER_WINDOWS) {
    const r = await runBuilder(label, mode, w, h);
    const where = `builder ${label} ${w}x${h}`;
    console.log(`  ${where.padEnd(34)} ${r.bad.length ? `${r.bad.length} control(s) covered` : `all ${r.seen} controls clear`}`);
    for (const problem of r.bad) {
      failures.push(`${where}: ${problem}`);
    }
  }

  console.log('\nthe whoop room, on a tablet\n');
  for (const [label, w, h] of WHOOP_WINDOWS) {
    const r = await runWhoop(label, w, h);
    const where = `whoop room ${label} ${w}x${h}`;
    console.log(`  ${where.padEnd(44)} ${r.bad.length ? `${r.bad.length} problem(s)` : `${r.tools} tools, the card, the drawer and the bar all reachable`}`);
    for (const problem of r.bad) {
      failures.push(`${where}: ${problem}`);
    }
  }

  console.log('\nthe freestyle results page, on a laptop\n');
  for (const [w, h] of RESULTS_WINDOWS) {
    const r = await runResults(w, h);
    const where = `results ${w}x${h}`;
    console.log(`  ${where.padEnd(34)} ${r.bad.length ? `${r.bad.length} problem(s)` : 'rows and best line clear of the menu'}`);
    for (const problem of r.bad) {
      failures.push(`${where}: ${problem}`);
    }
  }

  console.log('\nthe flight OSD, on a phone held sideways with the thumb sticks up\n');
  for (const [kind, w, h] of FLIGHT_CASES) {
    const r = await runFlight(kind, w, h);
    const where = `flight ${kind} ${w}x${h}`;
    const all = Object.entries(r).flatMap(([stage, list]) => list.map((p) => `${stage}: ${p}`));
    console.log(`  ${where.padEnd(34)} ${all.length ? `${all.length} problem(s)` : 'centre third, plates and clock clear on the pads, in the air and paused'}`);
    for (const problem of all) {
      failures.push(`${where} ${problem}`);
    }
  }

  if (failures.length) {
    console.log(`\nFAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('\nPASS, every row and every note is reachable on every device, every builder bar control on a laptop, the whoop room usable with fingers on a tablet, the results page clear of its menu, and the flight OSD on a phone clear of the centre third');
  return 0;
}

process.exit(await main());
