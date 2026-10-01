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
 *                        Q  E  camera up and down (held), Z level it
 *                        P  take a photo, O the photo gallery
 *                        K  learn a gamepad or radio's tilt and shutter
 *   gimbal(q, out)     the camera's world orientation for craft attitude q
 *   frame(...)         once a frame: read the autopilot's report, keep the
 *                      endurance clock, move the gimbal, read the learned
 *                      controls, drive the map's lights and the HUD
 *   reset()            a new run: a full pack, no contacts, no photos
 *
 * THE CAMERA is on a stabilised gimbal, as on the aircraft of this class:
 * it keeps the horizon level and turns with the aircraft's heading, and
 * the pilot tilts it from straight up to straight down. The lights tilt
 * with it.
 *
 * PHOTOS are what an inspection flight is for. Each one is a thumbnail of
 * the real frame, a POI marker in the world where the camera was aimed, and
 * a grade, because the training is in taking a photo an inspector can use:
 * lit, sharp, and close enough to see the surface but not so close that the
 * light burns it out.
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

import * as THREE from 'three';

import { airframeById } from '../../configs/airframes.js';

const REPORT_DOUBLES = 9;
const MODE_NAMES = { 1: 'POSITION', 2: 'ATTI' };
const LIGHT_STEPS = [0.25, 0.5, 0.75, 1.0];
const TILT_MAX = 90;          /* degrees each way from level */
const TILT_RATE = 60;         /* degrees a second, keys and buttons held */
const BIND_KEY = 'webpilot.inspection.controls.v1';
/* Photo grading. Distances suit a 4K inspection camera on a 5 inch class
 * aircraft: inside 0.3 m the lights burn the surface out and the lens
 * cannot focus, past 4 m a crack is a few pixels. Motion above a quarter
 * of a metre a second or twenty degrees a second blurs a frame lit by the
 * aircraft's own lights. */
const SHOT_NEAR = 0.3;
const SHOT_FAR = 4.0;
const SHOT_SPEED = 0.25;
const SHOT_RATE = 20 * Math.PI / 180;

function loadBindings() {
  try {
    const b = JSON.parse(localStorage.getItem(BIND_KEY) || 'null');
    return b && typeof b === 'object' ? b : {};
  } catch (e) {
    return {};
  }
}

function saveBindings(b) {
  try {
    localStorage.setItem(BIND_KEY, JSON.stringify(b));
  } catch (e) {
    /* Private mode: they hold for this visit. */
  }
}

function padById(id) {
  const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
  for (const gp of pads) {
    if (gp && (!id || gp.id === id)) {
      return gp;
    }
  }
  return null;
}

const pressed = (gp, i) => Boolean(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);

/* The module's own refusal for a bad argument, so a stale wasm without the
 * export is told apart from a call that was refused. */
function callable(sim, name) {
  return sim && sim.e && typeof sim.e[name] === 'function';
}

export function createInspection({ sim, notify, input }) {
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
    tilt: 0,               /* camera tilt, degrees, + up */
    bind: loadBindings(),  /* { tilt, photo } learned controls */
    learn: null,           /* { step, base } while learning */
    lastAxis: null,
    photoPrev: false,
    photos: [],
    shooting: false,
    quad: null,
    gs: 0,                 /* ground speed, m/s, for the photo grader */
    rate: 0,
  };
  const gimbalQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const tmpV = new THREE.Vector3();

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

  /* The shutter: a white flash over the frame. */
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:40;transition:opacity 220ms ease-out';
  document.body.appendChild(flash);
  let audioCtx = null;
  const shutterSound = () => {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const n = Math.floor(audioCtx.sampleRate * 0.06);
      const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i += 1) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / n) * (i < n * 0.4 || i > n * 0.55 ? 1 : 0.2);
      }
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.35;
      src.buffer = buf;
      src.connect(gain).connect(audioCtx.destination);
      src.start();
    } catch (e) {
      /* No sound is not an error. */
    }
  };

  /* The gallery: every photo of this flight, its grade and where it was. */
  const gallery = document.createElement('div');
  gallery.id = 'inspection-gallery';
  gallery.style.cssText = [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)', 'z-index:45',
    'display:none', 'width:min(960px,94vw)', 'max-height:84vh', 'overflow:auto',
    'background:rgba(8,12,10,0.94)', 'border:1px solid rgba(160,255,190,0.35)', 'border-radius:8px',
    'padding:14px', 'color:#e8f1ea', 'font:13px/1.4 system-ui,sans-serif',
  ].join(';');
  document.body.appendChild(gallery);
  const GRADE_COLOUR = { GOOD: '#7dffb0', USABLE: '#ffd27d', REJECT: '#ff8a7d' };
  function renderGallery() {
    gallery.textContent = '';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px';
    const h = document.createElement('strong');
    h.style.fontSize = '15px';
    const good = state.photos.filter((ph) => ph.grade === 'GOOD').length;
    h.textContent = `Photos this flight: ${state.photos.length}, ${good} good`;
    const hint = document.createElement('span');
    hint.style.opacity = '0.7';
    hint.textContent = 'O closes';
    head.append(h, hint);
    gallery.append(head);
    if (!state.photos.length) {
      const p = document.createElement('p');
      p.textContent = 'No photos yet. Aim the camera with Q and E, light the surface, hold still and press P.';
      gallery.append(p);
      return;
    }
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px';
    for (const ph of state.photos) {
      const card = document.createElement('figure');
      card.style.cssText = `margin:0;border:2px solid ${GRADE_COLOUR[ph.grade]};border-radius:6px;overflow:hidden;background:#000`;
      const img = document.createElement('img');
      img.src = ph.url;
      img.alt = `Photo ${ph.n}`;
      img.style.cssText = 'display:block;width:100%';
      const cap = document.createElement('figcaption');
      cap.style.cssText = 'padding:6px 8px;font-size:12px;background:rgba(8,12,10,0.9)';
      const g = document.createElement('div');
      g.style.cssText = `font-weight:700;color:${GRADE_COLOUR[ph.grade]}`;
      g.textContent = `#${ph.n}  ${ph.grade}${ph.issues.length ? `: ${ph.issues.join(', ')}` : ''}`;
      const m = document.createElement('div');
      m.style.opacity = '0.8';
      m.textContent = `${ph.time}  alt ${ph.alt.toFixed(1)} m  range ${ph.range.toFixed(2)} m  tilt ${ph.tilt > 0 ? '+' : ''}${ph.tilt.toFixed(0)}\u00b0`;
      cap.append(g, m);
      card.append(img, cap);
      grid.append(card);
    }
    gallery.append(grid);
  }
  function toggleGallery(show) {
    const on = show ?? gallery.style.display === 'none';
    if (on) {
      renderGallery();
    }
    gallery.style.display = on ? 'block' : 'none';
  }
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
    if (code === 'KeyZ') {
      state.tilt = 0;
      notify('Camera level.');
      return true;
    }
    if (code === 'KeyP') {
      takePhoto();
      return true;
    }
    if (code === 'KeyO') {
      toggleGallery();
      return true;
    }
    if (code === 'KeyK') {
      learnStep();
      return true;
    }
    if (code === 'KeyQ' || code === 'KeyE') {
      /* Held, read every frame from input.keys; claimed here so nothing
       * else takes the press. */
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

  /* The gimbal: level, the aircraft's heading, the pilot's tilt. q is the
   * craft's attitude as a THREE.Quaternion. Writes and returns out. */
  function gimbal(q, out) {
    tmpV.set(0, 0, -1).applyQuaternion(q);
    const yaw = Math.abs(tmpV.x) + Math.abs(tmpV.z) > 1e-6 ? Math.atan2(-tmpV.x, -tmpV.z) : 0;
    euler.set(state.tilt * Math.PI / 180, yaw, 0, 'YXZ');
    return out.setFromEuler(euler);
  }

  /*
   * LEARNING A GAMEPAD OR RADIO'S CONTROLS, K in flight. Three steps, each
   * answered by moving the control or skipped with K: the tilt (a dial or
   * slider, which then sets the tilt directly like a gimbal wheel, or a
   * button, which then asks for a second button for down), and the shutter
   * (a button or a switch). The aircraft's own stick axes are never taken.
   */
  const LEARN_TEXT = {
    tilt: 'Camera tilt: turn a dial or slider, or press the TILT UP button. K skips.',
    tiltDown: 'Now press the TILT DOWN button. K skips.',
    photo: 'Shutter: press a button or flip a switch for PHOTO. K skips.',
  };
  function learnStep() {
    const order = ['tilt', 'tiltDown', 'photo'];
    if (!state.learn) {
      state.learn = { step: 'tilt', base: null };
    } else {
      let i = order.indexOf(state.learn.step) + 1;
      if (order[i] === 'tiltDown' && !(state.bind.tilt && state.bind.tilt.kind === 'buttons')) {
        i += 1;
      }
      if (i >= order.length) {
        state.learn = null;
        notify('Camera controls saved.');
        return;
      }
      state.learn = { step: order[i], base: null };
    }
    notify(LEARN_TEXT[state.learn.step]);
  }
  function stickAxes() {
    const s = new Set();
    const m = input && input.map;
    if (m) {
      for (const ch of ['throttle', 'roll', 'pitch', 'yaw']) {
        if (m[ch] && Number.isInteger(m[ch].axis)) {
          s.add(m[ch].axis);
        }
      }
    }
    return s;
  }
  function runLearn() {
    const gp = padById(null);
    if (!gp) {
      return;
    }
    const L = state.learn;
    if (!L.base || L.base.id !== gp.id) {
      L.base = { id: gp.id, axes: Array.from(gp.axes), buttons: (gp.buttons || []).map((b, i) => pressed(gp, i)) };
      return;
    }
    let got = null;
    for (let i = 0; i < L.base.buttons.length && !got; i += 1) {
      if (pressed(gp, i) && !L.base.buttons[i]) {
        got = { kind: 'button', index: i };
      }
    }
    const sticks = stickAxes();
    for (let i = 0; i < gp.axes.length && !got; i += 1) {
      const d = gp.axes[i] - L.base.axes[i];
      if (!sticks.has(i) && Math.abs(d) >= 0.5) {
        got = { kind: 'axis', index: i, dir: d > 0 ? 1 : -1 };
      }
    }
    if (!got) {
      return;
    }
    if (L.step === 'tilt') {
      state.bind.tilt = got.kind === 'axis'
        ? { id: gp.id, kind: 'axis', index: got.index }
        : { id: gp.id, kind: 'buttons', up: got.index, down: null };
    } else if (L.step === 'tiltDown' && got.kind === 'button') {
      state.bind.tilt.down = got.index;
    } else if (L.step === 'photo') {
      state.bind.photo = { id: gp.id, ...got };
      state.photoPrev = true;
    } else {
      return;
    }
    saveBindings(state.bind);
    learnStep();
  }

  /* The learned controls and the held keys, once a frame. */
  function readControls(dtS) {
    let rate = 0;
    if (input && input.keys) {
      if (input.keys.has('KeyQ')) {
        rate += 1;
      }
      if (input.keys.has('KeyE')) {
        rate -= 1;
      }
    }
    const b = state.bind;
    if (b.tilt) {
      const gp = padById(b.tilt.id);
      if (gp && b.tilt.kind === 'axis' && b.tilt.index < gp.axes.length) {
        const v = gp.axes[b.tilt.index];
        /* A dial sets the tilt directly, but only once it has moved, so
         * the keys still work with the dial left alone. */
        if (state.lastAxis === null || Math.abs(v - state.lastAxis) > 0.01) {
          if (state.lastAxis !== null) {
            state.tilt = Math.max(-1, Math.min(1, v)) * TILT_MAX;
          }
          state.lastAxis = v;
        }
      } else if (gp && b.tilt.kind === 'buttons') {
        if (pressed(gp, b.tilt.up)) {
          rate += 1;
        }
        if (b.tilt.down != null && pressed(gp, b.tilt.down)) {
          rate -= 1;
        }
      }
    }
    if (rate !== 0) {
      state.tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, state.tilt + rate * TILT_RATE * dtS));
    }
    if (b.photo) {
      const gp = padById(b.photo.id);
      if (gp) {
        const on = b.photo.kind === 'button'
          ? pressed(gp, b.photo.index)
          : b.photo.index < gp.axes.length && gp.axes[b.photo.index] * b.photo.dir > 0.5;
        if (on && !state.photoPrev) {
          takePhoto();
        }
        state.photoPrev = on;
      }
    }
  }

  function takePhoto() {
    const v = state.view;
    if (!state.af || !v || typeof v.capture !== 'function' || !state.quad || state.shooting) {
      return;
    }
    state.shooting = true;
    const q = gimbal(state.quad.quaternion, new THREE.Quaternion());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const origin = state.quad.position.clone();
    const hit = v.rayHit(origin, dir);
    const at = { speed: state.gs, rate: state.rate, tilt: state.tilt, alt: origin.y, lights: state.lightsOn };
    flash.style.transition = 'none';
    v.capture((shot) => {
      state.shooting = false;
      flash.style.opacity = '0.85';
      requestAnimationFrame(() => {
        flash.style.transition = 'opacity 220ms ease-out';
        flash.style.opacity = '0';
      });
      shutterSound();
      if (!shot) {
        notify('Photo failed.');
        return;
      }
      const issues = [];
      let severe = false;
      if (shot.luma < 0.08 || shot.dark > 0.6) {
        issues.push(at.lights ? 'too dark' : 'too dark, lights off');
        severe = true;
      } else if (shot.clipped > 0.35 || shot.luma > 0.85) {
        issues.push('overexposed');
        severe = true;
      }
      if (at.speed > SHOT_SPEED || at.rate > SHOT_RATE) {
        issues.push('motion blur');
        severe = true;
      }
      if (hit.distance < SHOT_NEAR) {
        issues.push('too close');
      } else if (hit.distance > SHOT_FAR) {
        issues.push('too far');
      }
      const grade = severe ? 'REJECT' : (issues.length ? 'USABLE' : 'GOOD');
      const n = state.photos.length + 1;
      state.photos.push({
        n,
        url: shot.url,
        grade,
        issues,
        range: hit.distance,
        alt: at.alt,
        tilt: at.tilt,
        time: fmtClock(state.flightS),
        point: hit.point.toArray(),
      });
      if (typeof v.addMarker === 'function' && hit.distance < 50) {
        v.addMarker(hit.point, dir, String(n));
      }
      notify(`Photo ${n}: ${grade}${issues.length ? `, ${issues.join(', ')}` : ''}. Range ${hit.distance.toFixed(2)} m.`);
      if (gallery.style.display !== 'none') {
        renderGallery();
      }
    });
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
  function frame({ view, flight, height, hit, speed, quad, rate }) {
    const nowMs = performance.now();
    const dtS = state.lastFrameMs > 0 ? (nowMs - state.lastFrameMs) / 1000 : 0;
    state.lastFrameMs = nowMs;
    if (view !== state.view) {
      state.view = view;
      lightsToView();
    }
    if (!state.af || !flight) {
      hud.style.display = 'none';
      if (view && typeof view.setLightAim === 'function') {
        view.setLightAim(null);
      }
      return;
    }
    state.quad = quad || state.quad;
    state.gs = speed;
    state.rate = rate || 0;
    if (state.learn) {
      runLearn();
    } else {
      readControls(Math.min(0.1, dtS));
    }
    if (quad && view && typeof view.setLightAim === 'function') {
      view.setLightAim(gimbal(quad.quaternion, gimbalQ));
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
    lines.push(`CAMERA    ${state.tilt > 0.5 ? '+' : ''}${state.tilt.toFixed(0)}\u00b0${Math.abs(state.tilt) < 0.5 ? ' level' : ''}`);
    {
      const last = state.photos[state.photos.length - 1];
      lines.push(`PHOTOS    ${state.photos.length}${last ? `  last ${last.grade}` : ''}`);
    }
    if (state.learn) {
      lines.push('LEARNING  controls, K skips');
    }
    lines.push('M mode  V speed  J lights  [ ] dim');
    lines.push('Q E tilt  Z level  P photo  O gallery');
    hud.textContent = lines.join('\n');
    hud.style.display = 'block';
    hud.style.borderColor = r && r[5] > 0 ? 'rgba(255,190,90,0.8)' : 'rgba(160,255,190,0.25)';
  }

  function reset() {
    state.flightS = 0;
    state.contacts = 0;
    state.lastHitMs = -1e9;
    state.photos = [];
    state.tilt = 0;
    toggleGallery(false);
    if (state.view && typeof state.view.clearMarkers === 'function') {
      state.view.clearMarkers();
    }
    push();
  }

  return {
    apply,
    key,
    frame,
    reset,
    gimbal,
    takePhoto,
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
      tilt: state.tilt,
      bind: state.bind,
      photos: state.photos.map(({ url, ...rest }) => rest),
      report: (() => {
        const r = report();
        return r ? Array.from(r) : null;
      })(),
    }),
  };
}
