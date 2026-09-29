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
import { measuresFor, placementFor, snapTurn } from './snap.js';

/* How far a press travels, in pixels, before it is a drag and not a click. */
const CLICK_PX = 4;

/* Tools that are not placed with a click on the floor: a road is laid node by
 * node and a vehicle is dropped on a road. Neither is on a whoop palette. */
const NOT_PLACED = new Set(['road', 'vehicle']);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class RoomEditor {
  constructor(view, host) {
    this.view = view;
    this.host = host;
    /* The gesture in progress, or null. */
    this.drag = null;
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
    if (d.kind === 'floor' || d.kind === 'place') {
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
      const snapped = h.snap({ x: g.x + d.offset.x, y: g.y + d.offset.y, z: 0 }, e.altKey);
      h.moveSelected(d.origin, { x: snapped.x - anchor.x, y: snapped.y - anchor.y, z: 0 });
      v.movePieces([...d.origin.keys()]);
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
        h.placeAt(h.snap(p, e.altKey));
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
    v.canvas.style.cursor = '';
    if (e && v.canvas.hasPointerCapture?.(e.pointerId)) {
      v.canvas.releasePointerCapture(e.pointerId);
    }
    v.markDirty();
    h.requestDraw();
  }

  /* The pointer left the canvas with nothing pressed: a ghost has nowhere to be. */
  onLeave() {
    if (!this.drag) {
      this.view.clearGhost();
      this.view.clearMeasures();
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
    const type = h.armed;
    const def = ELEMENTS[type];
    const p = v.levelPoint(e.clientX, e.clientY, 0);
    if (!def || !p) {
      v.clearGhost();
      v.clearMeasures();
      return;
    }
    const at = h.snap(p, e.altKey);
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
