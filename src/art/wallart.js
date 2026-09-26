/*
 * wallart.js: the whoop room's posters and banners, hung.
 *
 * The owner asked on 26 September 2026 for the whoop room to be recoloured
 * in the sakura theme and dressed with the slap pack's stickers "as wall
 * art", made into posters and banners. scripts/wallart.js makes the art: one
 * picture, assets/wallart/atlas.webp, and a table of where each piece is in
 * it, src/art/wallart-atlas.js. This hangs it: HANGING, in ./wallart-hang.js
 * with the quads and rods that hang each piece, is the whole of the design
 * decision about where, and this file lights the art and puts the picture
 * on it.
 *
 * PAINT, NOT SOLID. Nothing here goes into the collider set, and nothing
 * stands proud of its wall by more than a banner rod's width, 24 mm on a
 * real wall. The walls of this room stand exactly on the edge of the
 * builder's micro field, so anything deeper would stand where an author may
 * already have put a gate, and every published track has to fly exactly as
 * it did before the room was dressed.
 *
 * ONE DRAW. Every piece is a quad cut out of the one atlas, and every quad
 * is in one geometry with one material, so the room's twelve pieces of art
 * cost a single draw call. It is on layer 1, the no ink layer, with no depth
 * write and a polygon offset, which is how the room's floor logos are drawn
 * (roomDecals in src/render/scene.js): a print flat on a wall has no
 * silhouette to ink. The rods are the only relief, and they do ink.
 *
 * LOADED LATE, NEVER FATAL. The picture is fetched by URL from this module's
 * own address, so the board's card renderer, which builds rooms from
 * src/share/orbit.html, finds it too. The art stays hidden until it has
 * decoded; `ready` settles when it has, or when it failed, or after a few
 * seconds, whichever is first, and a picture that arrives later still goes
 * up the moment it does.
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
import { celMaterial } from '../render/celmat.js';
import { HANGING, wallArtGeometry } from './wallart-hang.js';

/* Where each piece hangs is ./wallart-hang.js's, and it is re-exported so
 * nothing that asked this module for it has to know it moved. */
export { HANGING };

/* How long the room waits for the picture before it lets the race start
 * without it, in milliseconds. */
const WAIT_MS = 6000;

/*
 * table   WALLART from src/art/wallart-atlas.js
 * room    { halfW, halfD, y0, K }: the room's half width and half depth in
 *         scene metres, its floor height, and MICRO_SCALE
 *
 * Returns { group, ready }, where ready is a promise that settles true when
 * the art is up and false when the room went on without it.
 */
export function hangWallArt(table, room) {
  const { art: geo, rods } = wallArtGeometry(table, room);

  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  /* Lit as the plaster is, with the room's warm rim, so a print sits in the
   * room's light rather than glowing on it. */
  const mat = celMaterial({
    color: 0xffffff, rim: 0.08, rimColor: 0xffe8ec, spec: 0.02,
    transparent: true, map: tex, key: 'wallart',
  });
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const art = new THREE.Mesh(geo, mat);
  art.name = 'wallArt';
  art.layers.set(1);
  art.visible = false;

  const group = new THREE.Group();
  group.name = 'wallArt';
  group.add(art);
  if (rods) {
    /* Bamboo, in the town's own bamboo green, drawn and inked like any
     * other object and in no collider set. */
    const rodMesh = new THREE.Mesh(
      rods,
      celMaterial({ color: 0x94b06b, rim: 0.18, rimColor: 0xffe8ec, spec: 0.12 }),
    );
    rodMesh.name = 'wallArtRods';
    group.add(rodMesh);
  }

  const img = new Image();
  img.decoding = 'async';
  const ready = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), WAIT_MS);
    img.onload = () => {
      tex.image = img;
      tex.needsUpdate = true;
      art.visible = true;
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      console.warn(`wallart: ${table.url} did not load; the room is bare`);
      clearTimeout(timer);
      resolve(false);
    };
  });
  img.src = new URL(`../../${table.url}?v=${table.rev}`, import.meta.url).href;
  return { group, ready };
}
