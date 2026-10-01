/*
 * inspection.js: the shell's side of the inspection aircraft.
 *
 * The autopilot itself is in the module (src/native/assist.c); this file is
 * everything the shell does around it, kept out of main.js so the fork's
 * footprint in upstream's largest file stays a handful of calls:
 *
 *   apply(airframeId)  push the airframe's autopilot settings to the module,
 *                      or switch the autopilot off for any other aircraft
 *   key(code)          the inspection keys, in flight, on these aircraft:
 *                        M  Position / ATTI
 *                        V  the next speed mode
 *                        J  lights on and off
 *                        [  ]  lights down and up
 *   frame(...)         once a frame: read the autopilot's report, keep the
 *                      endurance clock, drive the map's lights and the HUD
 *   reset()            a new run: a full pack, no contacts
 *
 * THE HUD is its own small panel, not the racing OSD's: it carries what an
 * inspection ground station shows a pilot (flight mode, speed mode,
 * height, the nearest surface, light output, time left on the pack, and
 * how many times the aircraft has touched something), and nothing a racer
 * reads.
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

import { airframeById } from '../../configs/airframes.js';

const REPORT_DOUBLES = 9;
const MODE_NAMES = { 1: 'POSITION', 2: 'ATTI' };
const LIGHT_STEPS = [0.25, 0.5, 0.75, 1.0];

/* The module's own refusal for a bad argument, so a stale wasm without the
 * export is told apart from a call that was refused. */
function callable(sim, name) {
  return sim && sim.e && typeof sim.e[name] === 'function';
}

export function createInspection({ sim, notify }) {
  const state = {
    af: null,
    mode: 1,
    speed: 0,
    lightsOn: true,
    light: 1.0,
    flightS: 0,
    contacts: 0,
    lastHitMs: -1e9,
    view: null,
    reportPtr: 0,
    lastFrameMs: 0,
  };

  const hud = document.createElement('div');
  hud.id = 'inspection-hud';
  hud.setAttribute('aria-live', 'off');
  hud.style.cssText = [
    'position:fixed', 'left:12px', 'bottom:12px', 'z-index:30', 'display:none',
    'font:600 12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'color:#e8f1ea', 'background:rgba(8,12,10,0.62)', 'border:1px solid rgba(160,255,190,0.25)',
    'border-radius:6px', 'padding:8px 10px', 'min-width:210px', 'pointer-events:none',
    'text-shadow:0 1px 0 #000', 'white-space:pre',
  ].join(';');
  document.body.appendChild(hud);
  /*
   * The racing furniture the flight screen carries that means nothing on an
   * inspection: the trick score, the lap or airtime clock, the weight
   * slider (these aircraft fly at their real weight), and the pack corner,
   * which this panel replaces with the endurance clock. Hidden by a class
   * on the body while an inspection aircraft is seated, so nothing in
   * ui.js has to know.
   */
  const style = document.createElement('style');
  style.textContent = [
    'body.is-inspection .score-hud,',
    'body.is-inspection .osd-clock,',
    'body.is-inspection .osd-air,',
    'body.is-inspection .osd-left { display: none !important; }',
  ].join('\n');
  document.head.appendChild(style);
  /* frame() is called from the flight branch only, so the panel would
   * outlive the flight screen. It hides itself when frames stop coming. */
  const watch = () => {
    if (hud.style.display !== 'none' && performance.now() - state.lastFrameMs > 250) {
      hud.style.display = 'none';
    }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);

  function settings() {
    return state.af && state.af.assist;
  }

  function push() {
    if (!callable(sim, 'sim_set_assist')) {
      return false;
    }
    const a = settings();
    if (!a) {
      /* Off. The other arguments are the module's defaults and only have
       * to be valid. */
      sim.e.sim_set_assist(0, 1, 1, 1, 20, 45, 0.5);
      sim.e.sim_set_assist_guard(0);
      return true;
    }
    const rc = sim.e.sim_set_assist(state.mode, a.speeds[state.speed], a.vUp, a.vDown,
      a.tiltMax, a.angleLimit, a.hover);
    sim.e.sim_set_assist_guard(state.mode === 1 ? a.guard : 0);
    return rc === 0;
  }

  function lightsToView() {
    const v = state.view;
    if (v && typeof v.setLights === 'function') {
      const lm = state.af ? state.af.lightLumens : 16000;
      v.setLights(state.lightsOn, state.light, lm);
    }
  }

  function apply(airframeId) {
    const af = airframeById(airframeId);
    const was = state.af;
    state.af = af.inspection ? af : null;
    if (state.af && state.af !== was) {
      state.mode = 1;
      state.speed = state.af.assist.defaultSpeed;
    }
    push();
    lightsToView();
    document.body.classList.toggle('is-inspection', Boolean(state.af));
    /* The title's one line of advice is a racer's ("through a gate"). */
    const note = document.querySelector('.first-note');
    if (note) {
      if (!note.dataset.upstream) {
        note.dataset.upstream = note.textContent;
      }
      note.textContent = state.af
        ? 'Push the left stick up to take off. Centred sticks hold position and height, so stop, look, and light what you are inspecting.'
        : note.dataset.upstream;
    }
    if (!state.af) {
      hud.style.display = 'none';
    }
  }

  function key(code) {
    if (!state.af) {
      return false;
    }
    const a = settings();
    if (code === 'KeyM') {
      state.mode = state.mode === 1 ? 2 : 1;
      push();
      notify(state.mode === 1
        ? 'POSITION. Sticks are speed. Centred holds position and height.'
        : 'ATTI. Sticks are lean and nothing brakes. Height is still held.');
      return true;
    }
    if (code === 'KeyV') {
      state.speed = (state.speed + 1) % a.speeds.length;
      push();
      notify(`Speed: ${a.speedLabels[state.speed]}, ${a.speeds[state.speed]} m/s at full stick.`);
      return true;
    }
    if (code === 'KeyJ') {
      state.lightsOn = !state.lightsOn;
      lightsToView();
      notify(state.lightsOn ? 'Lights on.' : 'Lights off.');
      return true;
    }
    if (code === 'BracketLeft' || code === 'BracketRight') {
      const i = LIGHT_STEPS.indexOf(state.light);
      const next = code === 'BracketLeft' ? Math.max(0, i - 1) : Math.min(LIGHT_STEPS.length - 1, i + 1);
      state.light = LIGHT_STEPS[next < 0 ? LIGHT_STEPS.length - 1 : next];
      state.lightsOn = true;
      lightsToView();
      notify(`Lights ${Math.round(state.light * 100)} percent.`);
      return true;
    }
    return false;
  }

  function report() {
    if (!callable(sim, 'sim_assist_report')) {
      return null;
    }
    if (!state.reportPtr) {
      state.reportPtr = sim.e.malloc(REPORT_DOUBLES * 8);
    }
    sim.e.sim_assist_report(state.reportPtr);
    return new Float64Array(sim.e.memory.buffer, state.reportPtr, REPORT_DOUBLES);
  }

  function fmtClock(s) {
    const t = Math.max(0, Math.floor(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  /*
   * Once a frame. `flight` is whether the flight screen is up, `height` the
   * craft's height over the floor, `hit` whether the shell counted a
   * contact this frame, `speed` the ground speed. The endurance clock runs
   * on wall time between frames, which is display only: it is a training
   * aid, not physics, and nothing the module steps reads it.
   */
  function frame({ view, flight, height, hit, speed }) {
    const nowMs = performance.now();
    const dtS = state.lastFrameMs > 0 ? (nowMs - state.lastFrameMs) / 1000 : 0;
    state.lastFrameMs = nowMs;
    if (view !== state.view) {
      state.view = view;
      lightsToView();
    }
    if (!state.af || !flight) {
      hud.style.display = 'none';
      return;
    }
    const r = report();
    const flying = r ? r[1] > 0 : false;
    if (flying) {
      state.flightS += Math.min(0.25, Math.max(0, dtS));
    }
    if (hit && nowMs - state.lastHitMs > 600) {
      state.contacts += 1;
      state.lastHitMs = nowMs;
    }
    const a = settings();
    const lines = [];
    const modeName = MODE_NAMES[state.mode] || 'OFF';
    lines.push(`${state.af.short.toUpperCase().padEnd(9)} ${modeName}${flying ? '' : '  (landed)'}`);
    lines.push(`SPEED     ${a.speedLabels[state.speed]} ${a.speeds[state.speed].toFixed(1)} m/s`);
    lines.push(`GS        ${speed.toFixed(2)} m/s   ALT ${height.toFixed(2)} m`);
    if (r && r[4] >= 0) {
      lines.push(`NEAREST   ${r[4].toFixed(2)} m${r[5] > 0 ? '  CAGE HOLDING' : ''}`);
    } else if (a.guard > 0) {
      lines.push(`NEAREST   clear`);
    }
    if (r && flying) {
      const holds = [r[2] > 0 ? 'POS' : null, r[3] > 0 ? 'ALT' : null].filter(Boolean).join(' ');
      lines.push(`HOLD      ${holds || '-'}`);
    }
    lines.push(`LIGHTS    ${state.lightsOn ? `${Math.round(state.light * 100)}%  ${Math.round(state.af.lightLumens * state.light)} lm` : 'OFF'}`);
    if (state.af.enduranceS > 0) {
      const left = state.af.enduranceS - state.flightS;
      lines.push(`BATTERY   ${left > 0 ? fmtClock(left) : 'LAND NOW'}`);
    } else {
      lines.push('POWER     tether');
    }
    lines.push(`CONTACTS  ${state.contacts}`);
    lines.push('M mode  V speed  J lights  [ ] dim');
    hud.textContent = lines.join('\n');
    hud.style.display = 'block';
    hud.style.borderColor = r && r[5] > 0 ? 'rgba(255,190,90,0.8)' : 'rgba(160,255,190,0.25)';
  }

  function reset() {
    state.flightS = 0;
    state.contacts = 0;
    state.lastHitMs = -1e9;
    push();
  }

  return {
    apply,
    key,
    frame,
    reset,
    active: () => Boolean(state.af),
    /* For tests and the console: what the panel says, without the DOM. */
    snapshot: () => ({
      airframe: state.af ? state.af.id : null,
      mode: state.mode,
      speed: state.speed,
      lightsOn: state.lightsOn,
      light: state.light,
      flightS: state.flightS,
      contacts: state.contacts,
      report: (() => {
        const r = report();
        return r ? Array.from(r) : null;
      })(),
    }),
  };
}
