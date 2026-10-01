/*
 * tank/index.js: the inside of a storage tank, the first inspection world.
 *
 * WHAT IT IS. A welded steel storage tank, 14 m across and 12 m to the
 * roof, the size of a mid sized fuel or water tank, as an inspection
 * aircraft sees it from inside: no daylight, no sky, the only light the
 * aircraft's own. The shell, plates and welds are drawn from real practice
 * (API 650 courses of 2 m plate with staggered vertical seams), and the
 * internals are the things a pilot has to fly round in a real one: a centre
 * roof support column, radial roof rafters, a fixed ladder up the shell, a
 * heating coil on stands near the floor, and an inlet nozzle.
 *
 * GEOMETRY IS PARAMETRIC on purpose. TANK below is the only place a size
 * lives, so the next vessels (a boiler, a ship's hold, a ballast tank) are
 * a different table and a different set of internals on the same builder,
 * and an imported model will hand its own solids to the same Colliders.
 *
 * THE WALL IS A RING OF CAPSULES, and the reason is the cage. The plant's
 * solid world (src/native/world.c) has axis aligned boxes and capsules.
 * Boxes would make the curved shell a staircase, and a caged aircraft
 * rolling along a staircase is struck by every tread. 240 vertical
 * capsules of 0.5 m radius, their axes on a circle 0.5 m outside the shell,
 * overlap into a surface whose scallops are under a centimetre deep, and
 * every normal points at the tank's axis, so a cage rolling round the shell
 * is rolling round a cylinder.
 *
 * THE LIGHT IS THE AIRCRAFT'S. Two spot lights stand on the aircraft and
 * point where it points, set every frame from the craft's own rendered pose
 * in onBeforeRender, plus a dim fill that is the light bouncing back off
 * the steel. There is no other light in the world, which is the point of
 * training in one: a pilot learns where the light is going.
 *
 * DUST, which every confined space pilot meets: motes drift in a box round
 * the aircraft and glow only inside the light cones, so the light can be
 * seen hitting it.
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

import { Colliders } from '../../game/collide.js';
import { disposeSceneGraph } from '../../render/shell.js';
import { SESSION_TEXTURES } from '../../render/session-textures.js';
import { qualityFor } from '../../render/quality.js';
import { yieldToPaint } from '../../ui/loading.js';

/* Everything a tank is, in metres, Three.js frame (y up). */
export const TANK = {
  radius: 7.0,
  height: 12.0,
  course: 2.0,          /* plate course height, the horizontal weld spacing */
  plateArc: 3.0,        /* plate length round the shell, the vertical seams */
  wallCapsules: 240,
  wallCapsuleR: 0.5,
  columnR: 0.30,        /* the roof's centre support */
  rafters: 12,
  rafterDrop: 0.35,     /* rafter depth under the roof */
  coilR: 4.6,           /* heating coil ring radius */
  coilY: 0.55,
  coilPipeR: 0.06,
  nozzleY: 1.2,
  nozzleR: 0.35,
  nozzleLen: 0.9,
  ladderAngle: Math.PI * 0.5,
  spawn: { x: 0, z: 4.6, yaw: 0 },
};

/* A canvas texture of rolled steel plate: a mill scale ground, rust
 * blooming from the welds and the lower courses, and the seams themselves.
 * Deterministic: a fixed LCG, so every load draws the same tank. */
function plateTexture(w, h, coursesTall, platesRound, seed) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  g.fillStyle = '#5d5a55';
  g.fillRect(0, 0, w, h);
  /* Mill scale mottling. */
  for (let i = 0; i < 2600; i += 1) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 2 + rnd() * 14;
    const v = 70 + Math.floor(rnd() * 40);
    g.fillStyle = `rgba(${v},${v - 4},${v - 8},${0.08 + rnd() * 0.12})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  /* Rust, heavier low down where product and water sat. */
  for (let i = 0; i < 900; i += 1) {
    const x = rnd() * w;
    const y = h * Math.pow(rnd(), 0.6);
    const r = 3 + rnd() * 22;
    g.fillStyle = `rgba(${120 + Math.floor(rnd() * 50)},${55 + Math.floor(rnd() * 25)},${25},${0.05 + 0.18 * (y / h)})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  /* Welds: horizontal course seams, vertical seams staggered by half a
   * plate on alternate courses, the way a shell is erected. */
  const ch = h / coursesTall;
  const pw = w / platesRound;
  g.lineCap = 'round';
  for (let k = 0; k <= coursesTall; k += 1) {
    const y = k * ch;
    g.strokeStyle = 'rgba(40,36,32,0.9)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
    g.strokeStyle = 'rgba(150,120,90,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y + 2);
    g.lineTo(w, y + 2);
    g.stroke();
    /* Rust weeping down from the seam. */
    for (let i = 0; i < platesRound * 3; i += 1) {
      const x = rnd() * w;
      const len = 6 + rnd() * ch * 0.5;
      const grad = g.createLinearGradient(x, y, x, y + len);
      grad.addColorStop(0, 'rgba(140,62,22,0.55)');
      grad.addColorStop(1, 'rgba(140,62,22,0)');
      g.fillStyle = grad;
      g.fillRect(x - 1.5, y, 3 + rnd() * 3, len);
    }
  }
  for (let k = 0; k < coursesTall; k += 1) {
    const off = (k % 2) * pw * 0.5;
    for (let i = 0; i <= platesRound; i += 1) {
      const x = (off + i * pw) % w;
      g.strokeStyle = 'rgba(40,36,32,0.9)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x, (coursesTall - 1 - k) * ch);
      g.lineTo(x, (coursesTall - k) * ch);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/* The floor: lapped plates and sludge pooled toward the low side. */
function floorTexture(size, seed) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  g.fillStyle = '#3f3b36';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1800; i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 3 + rnd() * 20;
    const k = rnd();
    g.fillStyle = k < 0.5
      ? `rgba(30,26,22,${0.1 + rnd() * 0.25})`
      : `rgba(110,60,28,${0.05 + rnd() * 0.15})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const plate = size / 7;
  g.strokeStyle = 'rgba(25,22,20,0.9)';
  g.lineWidth = 3;
  for (let i = 0; i <= 7; i += 1) {
    g.beginPath();
    g.moveTo(i * plate, 0);
    g.lineTo(i * plate, size);
    g.stroke();
    const off = (i % 2) * plate * 0.5;
    for (let j = 0; j <= 7; j += 1) {
      g.beginPath();
      g.moveTo(i * plate, off + j * plate);
      g.lineTo((i + 1) * plate, off + j * plate);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/*
 * The aircraft's lights. Intensity in candela, since three r160 lights
 * are physical: a 16,000 lumen array over a cone of about 120 degrees is
 * pi steradians, about 5,000 cd, split over two units. `lumens` scales it
 * so the tethered class's 12,000 lumens are dimmer by the same ratio.
 */
function craftLights(scene, lumens) {
  const group = new THREE.Group();
  const cd = (lumens / Math.PI) / 2;
  const make = (side) => {
    const l = new THREE.SpotLight(0xfff4e6, cd, 40, Math.PI / 3, 0.55, 2);
    l.castShadow = false;
    l.userData.side = side;
    group.add(l);
    group.add(l.target);
    return l;
  };
  const spots = [make(-1), make(1)];
  /* The light the steel throws back, which is most of what lets a pilot see
   * the shape of the space outside the cone. Small, and it follows. */
  const fill = new THREE.PointLight(0xffe9d0, cd * 0.004, 14, 2);
  group.add(fill);
  scene.add(group);
  return { group, spots, fill, cd };
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

function aimLights(lights, quad, on, level) {
  const k = on ? level : 0;
  _fwd.set(0, 0, -1).applyQuaternion(quad.quaternion);
  _right.set(1, 0, 0).applyQuaternion(quad.quaternion);
  _up.set(0, 1, 0).applyQuaternion(quad.quaternion);
  for (const l of lights.spots) {
    const side = l.userData.side;
    l.intensity = lights.cd * k;
    l.position.copy(quad.position).addScaledVector(_right, 0.12 * side).addScaledVector(_up, 0.02);
    l.target.position.copy(l.position).addScaledVector(_fwd, 4).addScaledVector(_right, 0.35 * side);
    l.target.updateMatrixWorld();
  }
  lights.fill.intensity = lights.cd * 0.004 * k;
  lights.fill.position.copy(quad.position).addScaledVector(_fwd, 0.6);
}

/* Motes in a box round the aircraft, wrapped as it moves, lit only inside
 * the cone. A ShaderMaterial so the cone test is per mote on the GPU. */
function dust(scene, count, seed) {
  const BOX = 6.0;
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 1) {
    pos[i] = (rnd() - 0.5) * BOX;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uCentre: { value: new THREE.Vector3() },
      uDrift: { value: new THREE.Vector3() },
      uLight: { value: new THREE.Vector3() },
      uDir: { value: new THREE.Vector3(0, 0, -1) },
      uOn: { value: 1 },
      uBox: { value: BOX },
      uPx: { value: 1 },
    },
    vertexShader: `
      uniform vec3 uCentre; uniform vec3 uDrift; uniform vec3 uLight; uniform vec3 uDir;
      uniform float uBox; uniform float uOn; uniform float uPx;
      varying float vGlow;
      void main() {
        vec3 p = mod(position + uDrift - uCentre + 0.5 * uBox, uBox) - 0.5 * uBox + uCentre;
        vec3 d = p - uLight;
        float dist = length(d);
        float cosA = dot(d / max(dist, 1e-4), uDir);
        float cone = smoothstep(0.5, 0.8, cosA);
        vGlow = uOn * cone * (1.0 / (1.0 + dist * dist * 0.35));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * 2.2 / max(-mv.z, 0.2);
      }`,
    fragmentShader: `
      varying float vGlow;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c)) * vGlow;
        if (a < 0.003) discard;
        gl_FragColor = vec4(1.0, 0.95, 0.85, a * 0.55);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, mat };
}

/*
 * The colliders: the shell as a ring of capsules, the roof as a slab, and
 * every internal as what it is. Three.js frame, metres.
 */
function buildColliders(T) {
  const col = new Colliders();
  const ringR = T.radius + T.wallCapsuleR;
  for (let i = 0; i < T.wallCapsules; i += 1) {
    const a = (i / T.wallCapsules) * Math.PI * 2;
    const x = ringR * Math.cos(a);
    const z = ringR * Math.sin(a);
    col.add('wall', x, -1, z, x, T.height + 1, z, T.wallCapsuleR);
  }
  /* Roof: a slab over the whole tank. */
  const R = T.radius + 1;
  col.addBox('wall', -R, T.height, -R, R, T.height + 0.5, R);
  /* Centre column, floor to roof. */
  col.add('pole', 0, 0, 0, 0, T.height, 0, T.columnR);
  /* Rafters: column top to shell, just under the roof. */
  const ry = T.height - T.rafterDrop * 0.5;
  for (let i = 0; i < T.rafters; i += 1) {
    const a = (i / T.rafters) * Math.PI * 2;
    col.add('pole', 0.4 * Math.cos(a), ry, 0.4 * Math.sin(a),
      (T.radius - 0.05) * Math.cos(a), ry, (T.radius - 0.05) * Math.sin(a), T.rafterDrop * 0.5);
  }
  /* Heating coil: a ring of short capsules on the floor stands. */
  const segs = 48;
  for (let i = 0; i < segs; i += 1) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    col.add('pole', T.coilR * Math.cos(a0), T.coilY, T.coilR * Math.sin(a0),
      T.coilR * Math.cos(a1), T.coilY, T.coilR * Math.sin(a1), T.coilPipeR);
  }
  /* Inlet nozzle, through the shell opposite the ladder. */
  const na = T.ladderAngle + Math.PI;
  const nx = Math.cos(na);
  const nz = Math.sin(na);
  col.add('pole', (T.radius - T.nozzleLen) * nx, T.nozzleY, (T.radius - T.nozzleLen) * nz,
    T.radius * nx, T.nozzleY, T.radius * nz, T.nozzleR);
  /* Ladder: two stiles standing 0.25 m off the shell. */
  const la = T.ladderAngle;
  const lr = T.radius - 0.25;
  for (const side of [-1, 1]) {
    const a = la + side * (0.22 / lr);
    col.add('pole', lr * Math.cos(a), 0, lr * Math.sin(a), lr * Math.cos(a), T.height - 0.5, lr * Math.sin(a), 0.03);
  }
  col.build();
  return col;
}

function buildVisuals(scene, T, q) {
  const steel = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.35 });
  const circ = 2 * Math.PI * T.radius;
  const plates = Math.round(circ / T.plateArc);
  const courses = Math.round(T.height / T.course);
  const texW = q.id === 'low' ? 2048 : 4096;
  const shellTex = plateTexture(texW, 1024, courses, plates, 0x7a3b11);
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(T.radius, T.radius, T.height, 128, 1, true),
    steel(shellTex),
  );
  shell.material.side = THREE.BackSide;
  shell.position.y = T.height * 0.5;
  scene.add(shell);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(T.radius, 96), steel(floorTexture(2048, 0x11f00d)));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const roof = new THREE.Mesh(new THREE.CircleGeometry(T.radius, 96), steel(plateTexture(1024, 1024, 7, 7, 0x2bad)));
  roof.rotation.x = Math.PI / 2;
  roof.position.y = T.height;
  scene.add(roof);

  const member = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.7, metalness: 0.5 });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(T.columnR, T.columnR, T.height, 24), member);
  column.position.y = T.height * 0.5;
  scene.add(column);
  for (let i = 0; i < T.rafters; i += 1) {
    const a = (i / T.rafters) * Math.PI * 2;
    const len = T.radius - 0.45;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(len, T.rafterDrop, 0.12), member);
    beam.position.set((0.4 + len * 0.5) * Math.cos(a), T.height - T.rafterDrop * 0.5, (0.4 + len * 0.5) * Math.sin(a));
    beam.rotation.y = -a;
    scene.add(beam);
  }
  /* Heating coil and its stands. */
  const coil = new THREE.Mesh(new THREE.TorusGeometry(T.coilR, T.coilPipeR, 10, 96), member);
  coil.rotation.x = Math.PI / 2;
  coil.position.y = T.coilY;
  scene.add(coil);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, T.coilY, 0.06), member);
    stand.position.set(T.coilR * Math.cos(a), T.coilY * 0.5, T.coilR * Math.sin(a));
    scene.add(stand);
  }
  /* Inlet nozzle. */
  const na = T.ladderAngle + Math.PI;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(T.nozzleR, T.nozzleR, T.nozzleLen, 24, 1, true), member);
  nozzle.material = member.clone();
  nozzle.material.side = THREE.DoubleSide;
  nozzle.rotation.z = Math.PI / 2;
  nozzle.rotation.y = -na;
  nozzle.position.set((T.radius - T.nozzleLen * 0.5) * Math.cos(na), T.nozzleY, (T.radius - T.nozzleLen * 0.5) * Math.sin(na));
  scene.add(nozzle);
  /* Ladder: stiles and rungs every 0.3 m. */
  const la = T.ladderAngle;
  const lr = T.radius - 0.25;
  const ladder = new THREE.Group();
  const stileGeo = new THREE.CylinderGeometry(0.03, 0.03, T.height - 0.5, 8);
  for (const side of [-1, 1]) {
    const stile = new THREE.Mesh(stileGeo, member);
    stile.position.set(side * 0.22, (T.height - 0.5) * 0.5, 0);
    ladder.add(stile);
  }
  const rungGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.44, 6);
  for (let y = 0.3; y < T.height - 0.6; y += 0.3) {
    const rung = new THREE.Mesh(rungGeo, member);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, y, 0);
    ladder.add(rung);
  }
  ladder.position.set(lr * Math.cos(la), 0, lr * Math.sin(la));
  ladder.rotation.y = -la + Math.PI / 2;
  scene.add(ladder);
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const opts = options || {};
  const q = qualityFor(opts.quality);
  const T = TANK;
  const renderer = shell.renderer;
  const camera = shell.camera;
  const t0 = performance.now();

  /* Renderer state belongs to the map (src/maps/README.md). */
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x0a0908, 0.025);
  /* Not zero: a real tank has a manway open somewhere and a pilot's eye
   * adapts. Enough to make out the shell's silhouette and nothing more. */
  scene.add(new THREE.HemisphereLight(0x6a7480, 0x1a1612, 0.035));
  progress(0.2);
  await yieldToPaint();

  buildVisuals(scene, T, q);
  progress(0.6);
  await yieldToPaint();

  const colliders = buildColliders(T);
  scene.add(shell.quad);

  const lights = craftLights(scene, opts.lumens ?? 16000);
  const motes = q.id === 'low' ? null : dust(scene, q.id === 'medium' ? 900 : 1800, 0xd057);
  let lightsOn = true;
  let level = 1.0;
  const t1 = performance.now();
  scene.onBeforeRender = () => {
    aimLights(lights, shell.quad, lightsOn, level);
    if (motes) {
      const u = motes.mat.uniforms;
      u.uCentre.value.copy(shell.quad.position);
      u.uLight.value.copy(shell.quad.position);
      u.uDir.value.set(0, 0, -1).applyQuaternion(shell.quad.quaternion);
      u.uOn.value = lightsOn ? level : 0;
      u.uPx.value = renderer.getPixelRatio() * renderer.domElement.height * 0.01;
      /* A slow drift, so the motes are air and not a texture. Wall clock,
       * decoration only: nothing the craft can hit reads it. */
      const s = (performance.now() - t1) * 0.001;
      u.uDrift.value.set(Math.sin(s * 0.13) * 0.4, -s * 0.03, Math.cos(s * 0.11) * 0.4);
    }
  };

  const post = {
    render() {
      renderer.render(scene, camera);
    },
    setSize() {},
    dispose() {},
  };
  progress(1);

  const AIM = new THREE.Vector3(0, T.height * 0.4, 0);
  const attractPath = [];
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    attractPath.push({ x: 4.2 * Math.cos(a), y: 3.0, z: 4.2 * Math.sin(a) });
  }

  return {
    id: 'tank',
    name: 'Storage tank',
    mode: 'freestyle',
    inspection: true,
    graphics: q.id,
    scene,
    post,
    colliders,
    gates: [],
    curve: null,
    spawn: { ...T.spawn },
    attract: { path: attractPath, speed: 1.2, lookAhead: 2, aimDrop: 0.5 },
    references: {},
    notes: [],
    height: () => 0,
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus() {},
    updateWind() {},
    updateAnim() {},
    egg: null,
    marks: [],
    gaps: [],
    /* The inspection controls the shell drives: the lights on the aircraft.
     * level is 0 to 1 of the airframe's lumens. */
    setLights(on, lvl) {
      lightsOn = Boolean(on);
      if (Number.isFinite(lvl)) {
        level = Math.max(0, Math.min(1, lvl));
      }
    },
    lightsState: () => ({ on: lightsOn, level }),
    tank: { ...T },
    stats: () => ({
      colliders: colliders.stats(),
      buildMs: t1 - t0,
      lights: lights.spots.length,
      motes: motes ? motes.pts.geometry.attributes.position.count : 0,
    }),
    dispose() {
      scene.onBeforeRender = () => {};
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
    },
  };
}
