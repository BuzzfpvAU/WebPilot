/*
 * cube.js: where the faces of a cube are. Pure arithmetic, no Three.js.
 *
 * The designer's cube is a frame you fly in through one face of and out of through another, and a
 * whoop room's frame is pipe. So a cube is what it is made of: ONE GATE FOR EACH FACE, five or six
 * squares of pipe that share their edges. Nothing in the physics, the course, the race or the views
 * has to learn a new thing, because a face IS a gate, and the two passes that fly a cube are two
 * gates in the flying order. What a cube adds is this layout, a group that says the faces are one
 * piece (model.js), and a tool that lays them in one click (snap.js placeCube).
 *
 * EACH OF THE TWELVE EDGES IS BUILT ONCE, by taking sides away that the builder already knows how to
 * take away:
 *
 *   front, back   keep their four sides: the two uprights are four of the cube's vertical edges, and
 *                 the top and bottom bars are two top edges and two bottom edges
 *   left, right   have no uprights (the front and back's stand at the corners); their bars are the
 *                 other two top edges and the other two bottom edges
 *   top, bottom   are gaps in the lattice (`unbuilt`): they score, they light and they pin the line,
 *                 and their four sides are the bars the others carry
 *
 * So the pipe is twelve lengths and eight three way corners, which is what a cube of pipe is, and the
 * build sheet, the room and the game all say so without being told. The floor is the sill, as it is
 * under any gate that builds no bottom member: a cube on the floor has five faces, because the sixth
 * would be under it, and a cube lifted by at least half an opening and a pipe has six.
 *
 * Every face is placed with its plane on the centre line of the pipe: half an opening and a pipe from
 * the middle of the cube, so the openings are the openings and the pipe is round them.
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

/* The faces, in the order a cube is made and read. A new cube is flown through the first two, in at the
 * back and out at the front, the way its front faces; the index of a face here is the index of its id in
 * what placeCube returns. */
export const CUBE_FACES = ['front', 'back', 'left', 'right', 'top', 'bottom'];

/*
 * The faces of a cube whose openings are `edge` across, of pipe `tube` in radius, its bottom `lift` above
 * the floor, about the middle of the cube and before it is turned: x is the way the front faces, y is to
 * its left. Each face is { face, x, y, yaw, pitch, sillH, unbuilt, unbuiltSides }, in the terms a gate is
 * made of, so a gate made from it is the face.
 *
 * An upright face's sill is the lift. A flat face's is the height of its centre less half its opening,
 * which is how a horizontal gate is described: the top's centre is a pipe over the top edge and the
 * bottom's is a pipe under the bottom edge.
 */
export function cubeFaces(edge, tube, lift = 0) {
  const d = edge / 2 + tube;
  const upright = (face, x, y, yaw, sides) => ({
    face, x, y, yaw, pitch: 0, sillH: lift, unbuilt: false, unbuiltSides: sides,
  });
  const flat = (face, sillH) => ({
    face, x: 0, y: 0, yaw: 0, pitch: Math.PI / 2, sillH, unbuilt: true, unbuiltSides: [],
  });
  const faces = [
    upright('front', d, 0, 0, []),
    upright('back', -d, 0, Math.PI, []),
    upright('left', 0, d, Math.PI / 2, ['left', 'right']),
    upright('right', 0, -d, -Math.PI / 2, ['left', 'right']),
    flat('top', lift + d),
  ];
  /* Only a cube that stands clear of the floor has a bottom to fly up through. */
  if (lift >= d - 1e-9) {
    faces.push(flat('bottom', lift - d));
  }
  return faces;
}
