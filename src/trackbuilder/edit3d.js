/*
 * edit3d.js: the gestures of the whoop room, where a track is built.
 *
 * WHY THERE IS A SECOND SET OF GESTURES. The 3D view was a preview, and its
 * drag on a gate that stood on the ground was an orbit: the natural gesture did
 * the opposite of what a pilot meant, and nothing in it could place anything.
 * On a whoop canvas the room is the tool now (WHOOP-BUILDER-PLAN.md, section
 * 3), and this file is what a press, a drag and a release mean there. The other
 * canvases keep view3d.js's own handlers, untouched.
 *
 * THE SPLIT. This file decides what a gesture is and asks the host to do it;
 * view3d.js draws, and knows where things are on the screen. So this module
 * holds no Three.js, is loaded with the view and costs nothing to a page that
 * never opens the room, and every change goes through the host's one door
 * (beginEdit, moveSelected, rotateSelected, endEdit, placeAt), which is how
 * undo, the autosave and the derived racing line come with it.
 *
 *   A tool armed:   a click on the floor places, and the tool stays armed. A
 *                   drag looks round instead, so the camera is never lost to
 *                   a tool. A ghost follows the pointer, snapped, with its
 *                   distance to the gate before it.
 *   Nothing armed:  press a gate, anywhere in it, and it is selected and can
 *                   be pulled across the floor. The ring at its foot turns it.
 *                   A press on empty floor orbits, and a click there lets go.
 *                   Shift drags a box. Right or middle drag pans.
 *
 * A press is not an edit. The undo step begins at the first real movement, so
 * a click that only selects leaves nothing behind.
 *
 * TOUCH. One finger does what the mouse does: a tap places or selects, a drag on
 * a gate moves it, a drag on the floor orbits. A second finger takes over: whatever
 * the first was doing is put back, and two fingers are the camera, sliding with
 * the pair's middle, zooming with the distance between them and turning with the
 * twist. The finger left when one lifts has no gesture to go on with (a gesture
 * begins with a press), so a lifted pair never becomes a stray move. Only fingers
 * are tracked that way; a pen is a mouse that cannot hover.
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

import { ELEMENTS, KIND, defaultDims, trackClassOf } from './elements.js';
import { elementById, kindOf, apertureCenter, aperturesOf } from './model.js';
import {
  measuresFor, placementFor, rowPlan, rulerPoint, rulerReading, snapTurn, spacingTone,
} from './snap.js';
import { inches, GATE_SPACING_NOMINAL } from './racegow.js';

/* How far a press travels, in pixels, before it is a drag and not a click. */
const CLICK_PX = 4;

/* Tools that are not placed with a click on the floor: a road is laid node by
 * node and a vehicle is dropped on a road. Neither is on a whoop palette. */
const NOT_PLACED = new Set(['road', 'vehicle', 'route']);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class RoomEditor {
  constructor(view, host) {
    this.view = view;
    this.host = host;
    /* The gesture in progress, or null. */
    this.drag = null;
    /* The ruler being drawn, or held after its second click: { a, b, fixed }. */
    this.ruler = null;
    /* The fingers on the screen, by pointer id, and the two-finger gesture they
     * are making, if any. */
    this.touches = new Map();
    this.pinch = null;
  }

  /* Whether these are the handlers: a whoop track, with the room up. */
  active() {
    return Boolean(this.view.enabled && this.view.renderer && this.host.isWhoopRace());
  }

  /* ---------------- press ---------------- */

  onDown(e) {
    const v = this.view;
    const h = this.host;
    const at = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch') {
      /* A primary touch is the first finger of a new hand, so anything left over
       * from an old one (a lift the page never heard about) is forgotten. */
      if (e.isPrimary) {
        this.touches.clear();
        this.pinch = null;
      }
      this.touches.set(e.pointerId, at);
      if (this.touches.size === 2) {
        this.beginPinch();
        return;
      }
      if (this.touches.size > 2) {
        return;
      }
    }
    if (e.button === 1 || e.button === 2) {
      /* Right click puts an armed tool away, as it does on the plan; when
       * nothing is armed, right and middle drag pan. */
      if (e.button === 2 && h.armed) {
        h.disarm();
        return;
      }
      v.canvas.setPointerCapture(e.pointerId);
      this.drag = { kind: 'pan', last: at };
      return;
    }
    if (e.button !== 0) {
      return;
    }
    v.canvas.setPointerCapture(e.pointerId);

    /* The row tool: a drag along the floor is the row. */
    if (h.armed === 'row') {
      this.beginRow(e, at);
      return;
    }
    /* The ruler: a click is a point, and a drag looks round, as a tool does. */
    if (h.armed === 'ruler') {
      this.drag = { kind: 'ruler', start: at, last: at, moved: false };
      return;
    }
    /* Fly order: a click on a piece adds a pass through it, and a drag looks round.
     * What is under the pointer is read at the press, before anything moves it. */
    if (h.armed === 'route') {
      this.drag = { kind: 'route', start: at, last: at, moved: false, hit: v.pickHit(e) };
      return;
    }

    /* A tool: a click places, a drag looks round. Whatever is under the
     * pointer, a gate included, because a tool armed is a tool armed. */
    if (h.armed && !NOT_PLACED.has(h.armed)) {
      this.drag = { kind: 'place', start: at, last: at, moved: false };
      v.clearGhost();
      return;
    }

    const hit = v.pickHit(e);
    if (hit && hit.ring) {
      this.drag = { kind: 'turn', id: hit.id, start: at, last: at, began: false };
      return;
    }

    /* The racing line runs through the middle of every gate, so it takes a
     * press only while Bend line is on, and then only where it is nearer than
     * what is hit or what is hit is only the pane across an opening. The
     * bend itself is the view's own gesture (a drag that starts on the line
     * drops a waypoint on it), so it is handed over whole. */
    if (h.bendLine) {
      const line = v.pathHit(e);
      if (line && (!hit || hit.weak || line.distance < hit.distance)) {
        v.drag = { kind: 'bend-pending', start: at, last: at, line };
        return;
      }
    }

    if (hit && hit.id) {
      this.pressElement(e, hit, at);
      return;
    }

    this.drag = e.shiftKey
      ? { kind: 'box', start: at, last: at, additive: true }
      : { kind: 'floor', start: at, last: at, moved: false };
  }

  pressElement(e, hit, at) {
    const v = this.view;
    const h = this.host;
    const el = elementById(h.doc, hit.id);
    if (!el) {
      return;
    }
    const was = h.selection.has(hit.id);
    if (e.shiftKey) {
      h.toggleSelection(hit.id);
      /* Shift clicking a selected element takes it OUT, so there is nothing
       * to pull by. Deselecting is the whole gesture. */
      if (!h.selection.has(hit.id)) {
        return;
      }
    } else if (!was) {
      h.setSelection([hit.id]);
    }
    /* A waypoint is a handle on the line, and pulling one moves it across its
     * own level and pins the gates either side of it (moveWaypoint), which is
     * the view's gesture and not a move. */
    if (el.type === 'waypoint' && !e.shiftKey) {
      v.beginWaypointGrab(e, hit.id, at);
      return;
    }
    this.drag = {
      kind: 'move',
      id: hit.id,
      start: at,
      last: at,
      began: false,
      /* The height of the point that was pressed, so the gate follows the
       * pointer exactly and not the floor under it. */
      plane: Math.max(0, hit.point ? hit.point.z : 0),
      origin: null,
      offset: null,
      /* A second press on a pipe of the one selected gate picks that side, to
       * be taken away with Delete (pickSide), as it always did; it happens on
       * release, and only when the press did not turn into a pull. */
      side: was && hit.side && !hit.weak && h.selection.size === 1 && !e.shiftKey ? hit.side : null,
    };
  }

  /* ---------------- movement ---------------- */

  onMove(e) {
    if (e.pointerType === 'touch') {
      if (this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this.pinch) {
        this.movePinch();
        return;
      }
    }
    const d = this.drag;
    if (!d) {
      this.hover(e);
      return;
    }
    const at = { x: e.clientX, y: e.clientY };
    const v = this.view;
    const h = this.host;
    if (d.kind === 'pan') {
      v.panBy(at.x - d.last.x, at.y - d.last.y);
      d.last = at;
      return;
    }
    if (d.kind === 'row') {
      const p = v.levelPoint(e.clientX, e.clientY, 0);
      if (!p) {
        return;
      }
      d.b = h.snap(p, e.altKey);
      this.showRow(d);
      return;
    }
    if (d.kind === 'floor' || d.kind === 'place' || d.kind === 'ruler' || d.kind === 'route') {
      if (!d.moved && dist(at, d.start) < CLICK_PX) {
        return;
      }
      d.moved = true;
      v.orbitBy(at.x - d.last.x, at.y - d.last.y);
      d.last = at;
      return;
    }
    if (d.kind === 'box') {
      d.last = at;
      v.showBox({ x0: d.start.x, y0: d.start.y, x1: at.x, y1: at.y });
      return;
    }
    if (d.kind === 'move') {
      if (!d.began) {
        if (dist(at, d.start) < CLICK_PX) {
          return;
        }
        this.beginMove(d);
      }
      const g = v.levelPoint(e.clientX, e.clientY, d.plane);
      if (!g) {
        return;
      }
      const anchor = d.origin.get(d.id);
      const pulled = elementById(h.doc, d.id);
      const snapped = h.snap({ x: g.x + d.offset.x, y: g.y + d.offset.y, z: 0 }, e.altKey,
        { type: pulled.type, ignore: [...d.origin.keys()] });
      h.moveSelected(d.origin, { x: snapped.x - anchor.x, y: snapped.y - anchor.y, z: 0 });
      v.movePieces([...d.origin.keys()]);
      v.setGuides(h.guides);
      this.measureDragged(d.id);
      return;
    }
    if (d.kind === 'turn') {
      if (!d.began) {
        if (dist(at, d.start) < CLICK_PX) {
          return;
        }
        h.beginEdit('rotate');
        d.began = true;
      }
      const el = elementById(h.doc, d.id);
      const g = v.levelPoint(e.clientX, e.clientY, 0);
      if (!el || !g) {
        return;
      }
      const raw = Math.atan2(g.y - el.position.y, g.x - el.position.x);
      h.rotateSelected(snapTurn(h.doc, el, raw, e.altKey));
      /* A turn changes what a piece IS, not only where, so the room is rebuilt
       * as it goes; it is rare, and a rebuild is a few milliseconds. */
      v.markDirty();
      return;
    }
  }

  /* The pieces about to be pulled, where they are, and where the pointer is
   * against the one that was pressed. The undo step begins here. */
  beginMove(d) {
    const h = this.host;
    const anchor = elementById(h.doc, d.id).position;
    d.origin = new Map([...h.selection].map((id) => [id, { ...elementById(h.doc, id).position }]));
    const g = this.view.levelPoint(d.start.x, d.start.y, d.plane);
    d.offset = g ? { x: anchor.x - g.x, y: anchor.y - g.y } : { x: 0, y: 0 };
    h.beginEdit('move');
    d.began = true;
  }

  /* ---------------- release ---------------- */

  onUp(e) {
    if (e.pointerType === 'touch') {
      this.letGo(e);
    }
    const d = this.drag;
    if (!d) {
      return;
    }
    const v = this.view;
    const h = this.host;
    this.drag = null;
    if (d.kind === 'floor' && !d.moved) {
      /* A click on empty floor lets go of what was selected. */
      h.setSelection([]);
    } else if (d.kind === 'place' && !d.moved) {
      const p = v.levelPoint(e.clientX, e.clientY, 0);
      if (p) {
        h.placeAt(h.snap(p, e.altKey, { type: h.armed }));
      }
    } else if (d.kind === 'row') {
      v.clearGhost();
      h.placeRow(d.a, d.b);
    } else if (d.kind === 'ruler' && !d.moved) {
      this.rulerClick(e);
    } else if (d.kind === 'route' && !d.moved) {
      if (d.hit && d.hit.id && !d.hit.ring) {
        h.routeTo(d.hit.id, d.hit.point);
      }
    } else if (d.kind === 'box') {
      h.setSelection(this.idsInBox(d, e), true);
      v.showBox(null);
    } else if (d.kind === 'move') {
      if (d.began) {
        h.endEdit();
      } else if (d.side) {
        h.pickSide(d.id, d.side);
      }
    } else if (d.kind === 'turn' && d.began) {
      h.endEdit();
    }
    v.clearMeasures();
    v.setGuides([]);
    v.canvas.style.cursor = '';
    if (e && v.canvas.hasPointerCapture?.(e.pointerId)) {
      v.canvas.releasePointerCapture(e.pointerId);
    }
    /* Whatever the gesture did, the scene is rebuilt from the document once,
     * now: a drag only moves pieces about. */
    v.markDirty();
    h.requestDraw();
  }

  /* The browser took the pointer away: a gesture half done is put back, and a
   * drag that never began has nothing to put back. */
  onCancel(e) {
    if (e.pointerType === 'touch') {
      this.letGo(e);
    }
    const d = this.drag;
    if (!d) {
      return;
    }
    const v = this.view;
    const h = this.host;
    this.drag = null;
    if ((d.kind === 'move' || d.kind === 'turn') && d.began) {
      h.revertEdit();
    }
    v.showBox(null);
    v.clearMeasures();
    v.setGuides([]);
    v.canvas.style.cursor = '';
    if (e && v.canvas.hasPointerCapture?.(e.pointerId)) {
      v.canvas.releasePointerCapture(e.pointerId);
    }
    v.markDirty();
    h.requestDraw();
  }

  /* ---------------- two fingers ---------------- */

  /*
   * A SECOND FINGER: put back what the first was doing (a piece half pulled goes
   * home, a box is dropped; a tap that had not moved had done nothing) and start
   * reading the pair as the camera.
   */
  beginPinch() {
    const v = this.view;
    const d = this.drag;
    if (d && (d.kind === 'move' || d.kind === 'turn') && d.began) {
      this.host.revertEdit();
    }
    this.drag = null;
    v.showBox(null);
    v.clearMeasures();
    v.setGuides([]);
    v.clearGhost();
    this.pinch = this.readPinch();
    v.markDirty();
    this.host.requestDraw();
  }

  /* Where the pair of fingers is: the middle, the distance and the angle of the
   * line between them, on the screen. */
  readPinch() {
    const [a, b] = [...this.touches.values()];
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  movePinch() {
    if (this.touches.size < 2) {
      return;
    }
    const v = this.view;
    const was = this.pinch;
    const now = this.readPinch();
    /* The angle wraps at half a turn; the step between two moves never does. */
    let twist = now.angle - was.angle;
    if (twist > Math.PI) {
      twist -= 2 * Math.PI;
    } else if (twist < -Math.PI) {
      twist += 2 * Math.PI;
    }
    /* The floor that was between the fingers is between them now: slide, spread
     * and twist are one grip (view3d gripFloor, which the wheel uses as well). A
     * clockwise twist on the screen is the angle growing, and turns the room
     * clockwise, which is the camera going the other way round it. */
    v.gripFloor(was.mid, now.mid, was.dist / now.dist, -twist);
    this.pinch = now;
  }

  /*
   * A FINGER LIFTED OR TAKEN AWAY. The pair is over when there are fewer than two.
   * Nothing else is undone, because there is nothing else to undo: the second
   * finger put the first one's gesture back and cleared it (beginPinch), so the
   * finger that is left is not doing anything until it, or another, is pressed.
   */
  letGo(e) {
    this.touches.delete(e.pointerId);
    if (this.pinch && this.touches.size < 2) {
      this.pinch = null;
    }
  }

  /* The pointer left the canvas with nothing pressed: a ghost has nowhere to be. */
  onLeave() {
    if (!this.drag) {
      this.view.clearGhost();
      this.view.clearMeasures();
      this.view.setGuides([]);
      this.view.setHover(null);
    }
  }

  /* The wheel zooms toward the pointer: what is under it stays under it. */
  onWheel(e) {
    this.view.zoomToward(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012));
  }

  /* ---------------- hover, and the ghost ---------------- */

  hover(e) {
    const v = this.view;
    const h = this.host;
    if (h.armed === 'ruler') {
      this.rulerHover(e);
      v.setHover(null);
      v.canvas.style.cursor = 'crosshair';
      return;
    }
    if (h.armed === 'route') {
      /* The piece a click would fly through lights up, as a piece does under the
       * pointer when nothing is armed. */
      const near = v.pickHit(e);
      v.setHover(near && near.id && !near.ring ? near.id : null);
      v.canvas.style.cursor = near && near.id ? 'pointer' : '';
      return;
    }
    if (h.armed && !NOT_PLACED.has(h.armed)) {
      this.showGhost(e);
      v.setHover(null);
      v.canvas.style.cursor = 'crosshair';
      return;
    }
    const hit = v.pickHit(e);
    v.setHover(hit && !hit.ring ? hit.id : null);
    v.canvas.style.cursor = hit ? (hit.ring ? 'grab' : 'pointer') : '';
    if (h.bendLine) {
      const line = v.pathHit(e);
      v.showLineKnob(line && (!hit || hit.weak || line.distance < hit.distance) ? line.pos : null);
    }
  }

  /*
   * THE GHOST: the piece as it would stand if the pointer were pressed now,
   * snapped to the grid, facing the way it would be placed, with its arrow and
   * the distance to the gate before it. Rebuilt only when the snapped spot or
   * its heading changes, not on every pointer move.
   */
  showGhost(e) {
    const v = this.view;
    const h = this.host;
    /* The row tool's ghost, before the drag, is one gate: where the row would begin. */
    const type = h.armed === 'row' ? 'gate' : h.armed;
    const def = ELEMENTS[type];
    const p = v.levelPoint(e.clientX, e.clientY, 0);
    if (!def || !p) {
      v.clearGhost();
      v.clearMeasures();
      return;
    }
    const at = h.snap(p, e.altKey, { type });
    v.setGuides(h.guides);
    const plan = placementFor(h.doc, at, type);
    v.setGhost({ type, position: { x: at.x, y: at.y, z: 0 }, yaw: plan.yaw });
    if (def.kind === KIND.APERTURE) {
      const ap = aperturesOf({ type, dims: defaultDims(type, trackClassOf(h.doc)) })[0];
      v.setMeasures(measuresFor(h.doc, { x: at.x, y: at.y, z: ap ? ap.centerH : 0 }));
    } else {
      v.clearMeasures();
    }
  }

  /* The distances round a gate that is being pulled. */
  measureDragged(id) {
    const el = elementById(this.host.doc, id);
    if (!el || kindOf(el) !== KIND.APERTURE) {
      this.view.clearMeasures();
      return;
    }
    const c = apertureCenter(el, 0);
    this.view.setMeasures(measuresFor(this.host.doc, c, id));
  }

  /* ---------------- the row ---------------- */

  /* A press with the row tool: where the row begins, magnets and all, as a gate's
   * position would be. */
  beginRow(e, at) {
    const v = this.view;
    const h = this.host;
    const p = v.levelPoint(e.clientX, e.clientY, 0);
    if (!p) {
      return;
    }
    const a = h.snap(p, e.altKey, { type: 'gate' });
    v.setGuides([]);
    this.drag = { kind: 'row', start: at, last: at, a: { x: a.x, y: a.y }, b: { x: a.x, y: a.y } };
    this.showRow(this.drag);
  }

  /* The row as it would be laid, drawn faint, and the 30 in between the gates. */
  showRow(d) {
    const v = this.view;
    const h = this.host;
    const plan = rowPlan(h.doc, d.a, d.b);
    v.setGhosts(plan.items.map((it) => ({ type: 'gate', position: { x: it.x, y: it.y, z: 0 }, yaw: it.yaw })));
    const centre = 0.3556;
    v.setMeasures(plan.items.slice(1).map((it, i) => {
      const before = plan.items[i];
      return {
        from: { x: before.x, y: before.y, z: centre },
        to: { x: it.x, y: it.y, z: centre },
        d: GATE_SPACING_NOMINAL,
        tone: spacingTone(GATE_SPACING_NOMINAL),
        text: inches(GATE_SPACING_NOMINAL),
      };
    }));
  }

  /* ---------------- the ruler ---------------- */

  /* A click with the ruler: the first point starts one, the second ends it, and
   * the next click starts another. What it says is not in the track. */
  rulerClick(e) {
    const p = this.view.levelPoint(e.clientX, e.clientY, 0);
    if (!p) {
      return;
    }
    const at = rulerPoint(this.host.doc, p, { off: e.altKey });
    this.ruler = !this.ruler || this.ruler.fixed
      ? { a: at, b: at, fixed: false }
      : { a: this.ruler.a, b: at, fixed: true };
    this.showRuler();
  }

  /* Between the two clicks, the line follows the pointer. */
  rulerHover(e) {
    if (!this.ruler || this.ruler.fixed) {
      return;
    }
    const p = this.view.levelPoint(e.clientX, e.clientY, 0);
    if (!p) {
      return;
    }
    this.ruler = { a: this.ruler.a, b: rulerPoint(this.host.doc, p, { off: e.altKey }), fixed: false };
    this.showRuler();
  }

  showRuler() {
    const r = this.ruler;
    this.view.setRuler(r ? { a: r.a, b: r.b, text: rulerReading(r.a, r.b).text, fixed: r.fixed } : null);
  }

  clearRuler() {
    this.ruler = null;
    this.view.setRuler(null);
  }

  /* ---------------- box select ---------------- */

  /* What a box drawn on the screen holds: every piece whose middle projects
   * inside it. */
  idsInBox(d, e) {
    const v = this.view;
    const x0 = Math.min(d.start.x, e.clientX);
    const x1 = Math.max(d.start.x, e.clientX);
    const y0 = Math.min(d.start.y, e.clientY);
    const y1 = Math.max(d.start.y, e.clientY);
    const rect = v.canvas.getBoundingClientRect();
    const ids = [];
    for (const el of this.host.doc.elements) {
      const c = kindOf(el) === KIND.APERTURE ? apertureCenter(el, 0) : el.position;
      const s = v.toScreen(c);
      if (!s) {
        continue;
      }
      const px = rect.left + s.x;
      const py = rect.top + s.y;
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
        ids.push(el.id);
      }
    }
    return ids;
  }
}
