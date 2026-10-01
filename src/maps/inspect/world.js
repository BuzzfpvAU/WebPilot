/*
 * inspect/world.js: what every inspection world shares.
 *
 * The storage tank was the first inspection world and all of this was in
 * it. The ballast tank is the second, so the parts that are about flying an
 * inspection aircraft rather than about one vessel live here, and each
 * vessel is its geometry, its colliders, its defects and a call to
 * inspectionWorld:
 *
 *   the aircraft's own two lights and the light the steel throws back
 *   dust in the air, lit only inside the cones
 *   the inspection camera's auto exposure and filmic curve
 *   a depth buffer the canvas does not have, and the pass to the canvas
 *   photographs, their brightness and the defects each one shows
 *   POI markers, the tether cable drawn, and the controls the shell drives
 *
 * The vessel hands over its own ray test (frontDistance: the first solid
 * along a ray, cheap enough to run every frame for the exposure) and the
 * meshes a photo's ray and a defect's line of sight are tested against.
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

import { disposeSceneGraph } from '../../render/shell.js';
import { SESSION_TEXTURES } from '../../render/session-textures.js';


/*
 * The aircraft's lights. Intensity in candela, since three r160 lights
 * are physical: a 16,000 lumen array over a cone of about 120 degrees is
 * pi steradians, about 5,000 cd, split over two units. `lumens` scales it
 * so the tethered class's 12,000 lumens are dimmer by the same ratio.
 */
/*
 * THE EXPOSURE. The renderer draws with no tone mapping and an sRGB output,
 * so a physically lit surface is "white" at a radiance of 1. A real camera
 * on one of these aircraft exposes for the patch its lights hit, a couple
 * of metres off, and a 5,000 cd array there is a few hundred lux. This
 * scale is that exposure: the candela the lights really have, times the
 * fraction that puts a grey steel wall two metres away at mid grey. It is
 * a camera setting, not a property of the lights, which is why it is one
 * number here rather than a smaller lumen figure in configs/airframes.js.
 */
export const EXPOSURE = 0.016;

export function craftLights(scene, lumens) {
  const group = new THREE.Group();
  const cd = (lumens / Math.PI) / 2 * EXPOSURE;
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

/* The lights stand on the aircraft (quad.position) and point along `aim`,
 * which is the camera gimbal's orientation when the shell has set one and
 * the airframe's own otherwise. */
export function aimLights(lights, quad, aim, on, level) {
  const k = on ? level : 0;
  _fwd.set(0, 0, -1).applyQuaternion(aim);
  _right.set(1, 0, 0).applyQuaternion(aim);
  _up.set(0, 1, 0).applyQuaternion(aim);
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
export function dust(scene, count, seed) {
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
 * The renderer as an inspection world wants it: no shadows, black clear,
 * and A FILMIC CURVE, which no other map uses. Every other map draws
 * untone mapped, which is right for daylight, but a light a hand's width
 * from a steel wall is a hundred times brighter than the same light two
 * metres off, and drawn linearly the near wall is a white sheet. A real
 * inspection camera exposes for it and rolls the highlights off; ACES does
 * the second half. Returns the function that puts it back, because the
 * next map must not inherit it (src/maps/README.md, renderer state belongs
 * to the map).
 */
export function prepareRenderer(renderer) {
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 1);
  const prevToneMapping = renderer.toneMapping;
  const prevExposure = renderer.toneMappingExposure;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return () => {
    renderer.toneMapping = prevToneMapping;
    renderer.toneMappingExposure = prevExposure;
  };
}

/* The first of a list of axis aligned boxes (THREE.Box3) along a ray from
 * p in unit direction f, by a slab test each, or tMax. */
export function boxRay(boxes, p, f, tMax) {
  let t = tMax;
  for (const b of boxes) {
    let t0 = 0;
    let t1 = t;
    for (const ax of ['x', 'y', 'z']) {
      const o = p[ax];
      const v = f[ax];
      if (Math.abs(v) < 1e-9) {
        if (o < b.min[ax] || o > b.max[ax]) {
          t1 = -1;
          break;
        }
        continue;
      }
      let ta = (b.min[ax] - o) / v;
      let tb = (b.max[ax] - o) / v;
      if (ta > tb) {
        const x = ta;
        ta = tb;
        tb = x;
      }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
    }
    if (t1 >= t0 && t0 > 0) {
      t = Math.min(t, t0);
    }
  }
  return t;
}

/* Every mesh in the scene a ray can stop on: not the ones marked noRay
 * (paint, beads, bolts, the cable) and not instances. Call it before the
 * aircraft, the lights, the defects and the markers join the scene. */
export function gatherOccluders(scene) {
  const out = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && !o.userData.noRay) {
      out.push(o);
    }
  });
  return out;
}

/*
 * The tether's cable, drawn. Its shape is the plant's (src/native/tether.c),
 * handed over each frame by the shell through setTether; this only draws
 * it, as forty short cylinders between its points, in the high visibility
 * yellow these cables are made in.
 */
export function cableVisuals(scene) {
  const SEGS = 40;
  const cableMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.55, metalness: 0.05 });
  const cable = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), cableMat, SEGS);
  cable.frustumCulled = false;
  cable.visible = false;
  cable.userData.noRay = true;
  scene.add(cable);
  const Y = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const R = 0.006;
  return {
    tension: 0,
    set(pts, tension) {
      if (!pts) {
        cable.visible = false;
        this.tension = 0;
        return;
      }
      for (let i = 0; i < SEGS; i += 1) {
        dir.subVectors(pts[i + 1], pts[i]);
        const len = dir.length();
        mid.addVectors(pts[i], pts[i + 1]).multiplyScalar(0.5);
        if (len > 1e-6) {
          q.setFromUnitVectors(Y, dir.multiplyScalar(1 / len));
        }
        m.compose(mid, q, sc.set(R, Math.max(len, 0.002), R));
        cable.setMatrixAt(i, m);
      }
      cable.instanceMatrix.needsUpdate = true;
      cable.visible = true;
      this.tension = Number.isFinite(tension) ? tension : 0;
    },
  };
}

/*
 * The rest of an inspection world, from a built scene. `w` carries:
 *   shell, opts, q, t0            buildMap's own
 *   scene, colliders, restore     the vessel's, and prepareRenderer's undo
 *   occluders                     gatherOccluders' list
 *   frontDistance(p, f)           the vessel's cheap ray, every frame
 *   defects                       roll, list, seen, reveal, seed
 *   tetherAnchor, tetherLength    where the cable starts (Three.js frame)
 *   id, name, spawn, aim, attractPath, extra (fields merged into the
 *   instance), stats (more numbers for the harness)
 */
export function inspectionWorld(w) {
  const { shell, opts, q, scene, colliders, occluders, frontDistance, defects } = w;
  const renderer = shell.renderer;
  const camera = shell.camera;
  const t0 = w.t0;
  const progress = w.progress ?? (() => {});
  const tether = cableVisuals(scene);
  scene.add(shell.quad);
  const lights = craftLights(scene, opts.lumens ?? 16000);
  const motes = q.id === 'low' ? null : dust(scene, q.id === 'medium' ? 900 : 1800, 0xd057);
  let lightsOn = true;
  let level = 1.0;
  const t1 = performance.now();
  /*
   * AUTO EXPOSURE, the inspection camera's. The lights fall off as the
   * square of distance, so a lens 15 cm off the steel sees forty times the
   * light it sees at a metre, and a camera on one of these aircraft stops
   * down for it. The distance is to whatever is in front, by the vessel's
   * own cheap ray (frontDistance). Exposure follows (d / 1.6)^2, clamped, eased over about a
   * third of a second the way a camera's does. Display only.
   */
  const fwd = new THREE.Vector3();
  let exposure = 1.0;
  let lastMs = performance.now();
  /* The gimbal's orientation, set by the shell (src/game/inspection.js)
   * each frame, or null for the airframe's own. */
  let aimQuat = null;
  const aimNow = () => aimQuat || shell.quad.quaternion;
  const photoRay = new THREE.Raycaster();
  scene.onBeforeRender = () => {
    aimLights(lights, shell.quad, aimNow(), lightsOn, level);
    {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastMs) / 1000);
      lastMs = now;
      fwd.set(0, 0, -1).applyQuaternion(aimNow());
      const d = frontDistance(shell.quad.position, fwd);
      const want = lightsOn ? Math.min(1, Math.max(0.03, (d / 1.6) * (d / 1.6))) : 1;
      exposure += (want - exposure) * Math.min(1, dt * 3);
      renderer.toneMappingExposure = exposure;
    }
    if (motes) {
      const u = motes.mat.uniforms;
      u.uCentre.value.copy(shell.quad.position);
      u.uLight.value.copy(shell.quad.position);
      u.uDir.value.set(0, 0, -1).applyQuaternion(aimNow());
      u.uOn.value = lightsOn ? level : 0;
      u.uPx.value = renderer.getPixelRatio() * renderer.domElement.height * 0.01;
      /* A slow drift, so the motes are air and not a texture. Wall clock,
       * decoration only: nothing the craft can hit reads it. */
      const s = (performance.now() - t1) * 0.001;
      u.uDrift.value.set(Math.sin(s * 0.13) * 0.4, -s * 0.03, Math.cos(s * 0.11) * 0.4);
    }
  };

  /*
   * PHOTOGRAPHS. A capture is taken from the drawing buffer straight after
   * the frame is rendered, in the same task, which is the one moment a
   * WebGL canvas without preserveDrawingBuffer still holds the picture. It
   * is scaled to a thumbnail and its brightness measured over the middle
   * of the frame, for the grader in src/game/inspection.js.
   */
  let pendingShot = null;
  const shotCanvas = document.createElement('canvas');
  const takeShot = () => {
    const src = renderer.domElement;
    const w = 320;
    const h = Math.max(1, Math.round((w * src.height) / Math.max(1, src.width)));
    shotCanvas.width = w;
    shotCanvas.height = h;
    const g = shotCanvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, w, h);
    const px = g.getImageData(Math.round(w * 0.25), Math.round(h * 0.25), Math.round(w * 0.5), Math.round(h * 0.5)).data;
    let sum = 0;
    let clipped = 0;
    let dark = 0;
    const n = px.length / 4;
    for (let i = 0; i < px.length; i += 4) {
      const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      sum += l;
      if (l > 0.96) {
        clipped += 1;
      }
      if (l < 0.04) {
        dark += 1;
      }
    }
    return {
      url: shotCanvas.toDataURL('image/jpeg', 0.82),
      luma: sum / n,
      clipped: clipped / n,
      dark: dark / n,
      /* The defects this frame shows, by the camera that drew it. */
      seen: defects.seen(camera, occluders),
    };
  };
  /* POI markers: a small lit ring where each photograph was aimed, with
   * its number. Part of this world, so they go when it does. */
  const markers = new THREE.Group();
  scene.add(markers);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.9, depthTest: true });
  const markerGeo = new THREE.TorusGeometry(0.09, 0.012, 6, 24);
  const label = (text) => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,12,10,0.75)';
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7dffb0';
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(0.16, 0.16, 1);
    sp.renderOrder = 10;
    return sp;
  };

  /*
   * A DEPTH BUFFER, which the canvas does not have. The shell makes its
   * renderer with depth: false (src/render/shell.js), because every other
   * map draws through a post chain whose targets carry their own. Drawn
   * straight to the canvas, this tank had no depth test at all: opaque
   * objects are drawn near to far, so whatever was farther painted over
   * whatever was nearer, and the heating coil showed through the
   * schoepentoeter. The scene goes into a half float target with depth,
   * and one full screen pass puts it on the canvas, where the filmic curve,
   * the exposure and the sRGB transfer are applied as they were before.
   */
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
  const blitScene = new THREE.Scene();
  const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blitMat = new THREE.MeshBasicMaterial({ map: target.texture, depthTest: false, depthWrite: false });
  blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat));
  const bufSize = new THREE.Vector2();
  const post = {
    render() {
      renderer.getDrawingBufferSize(bufSize);
      if (target.width !== bufSize.x || target.height !== bufSize.y) {
        target.setSize(bufSize.x, bufSize.y);
      }
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(blitScene, blitCam);
      if (pendingShot) {
        const cb = pendingShot;
        pendingShot = null;
        try {
          cb(takeShot());
        } catch (e) {
          cb(null);
        }
      }
    },
    setSize() {},
    dispose() {
      target.dispose();
      blitMat.dispose();
    },
  };
  progress(1);

  return {
    id: w.id,
    name: w.name,
    mode: 'freestyle',
    inspection: true,
    graphics: q.id,
    scene,
    post,
    colliders,
    gates: [],
    curve: null,
    spawn: { ...w.spawn },
    attract: { path: w.attractPath, speed: 1.2, lookAhead: 2, aimDrop: 0.5 },
    references: {},
    notes: [],
    height: () => 0,
    setNextGate() {},
    targetAim: () => w.aim,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus() {},
    updateWind() {},
    updateAnim() {},
    egg: null,
    marks: [],
    /* The tethered aircraft's ground station: where the cable starts, Three.js
     * frame, and how long it is. main.js hands both to the plant. */
    tether: { anchor: w.tetherAnchor.clone(), length: w.tetherLength },
    /* The cable's points from the plant, Three.js frame, or null for none. */
    setTether(pts, tension) {
      tether.set(pts, tension);
    },
    tetherTension: () => tether.tension,
    gaps: [],
    /* The inspection controls the shell drives (src/game/inspection.js): the
     * lights on the aircraft. level is 0 to 1 of `lumens`, the airframe's. */
    setLights(on, lvl, lumens) {
      lightsOn = Boolean(on);
      if (Number.isFinite(lvl)) {
        level = Math.max(0, Math.min(1, lvl));
      }
      if (Number.isFinite(lumens) && lumens > 0) {
        lights.cd = (lumens / Math.PI) / 2 * EXPOSURE;
      }
    },
    lightsState: () => ({ on: lightsOn, level }),
    /* The camera gimbal's world orientation (a THREE.Quaternion), or null. */
    setLightAim(q) {
      aimQuat = q || null;
    },
    /* The first solid along a ray from p in direction d (unit), Three.js
     * frame: { distance, point }. */
    rayHit(p, d) {
      let t = frontDistance(p, d);
      /* The analytic shapes, then every other solid by the mesh: the coil,
       * the rafters, the ladder, the vanes. Once a photo, not once a
       * frame, so the cost of a mesh ray is nothing. */
      photoRay.set(p, d);
      photoRay.near = 0;
      photoRay.far = t;
      const hits = photoRay.intersectObjects(occluders, false);
      if (hits.length) {
        t = Math.max(0.05, hits[0].distance);
      }
      return { distance: t, point: new THREE.Vector3().copy(p).addScaledVector(d, t) };
    },
    /* The defects of this flight: { seed, list }, list as defects.js's. */
    defects: () => ({ seed: defects.seed(), list: defects.list() }),
    /* A new set for a new flight, from seed or a fresh one. */
    rollDefects(seed) {
      defects.roll(seed);
      return { seed: defects.seed(), list: defects.list() };
    },
    /* Red rings on the listed defects, for after the hunt. */
    revealDefects(ids) {
      defects.reveal(ids);
    },
    /* Take a photograph from the next rendered frame; cb gets
     * { url, luma, clipped, dark } or null. */
    capture(cb) {
      pendingShot = cb;
    },
    /* A POI marker at point, facing back along the camera ray dir. */
    addMarker(point, dir, text) {
      const ring = new THREE.Mesh(markerGeo, markerMat);
      ring.position.copy(point).addScaledVector(dir, -0.02);
      ring.lookAt(ring.position.clone().sub(dir));
      const sp = label(text);
      sp.position.copy(point).addScaledVector(dir, -0.06);
      sp.position.y += 0.15;
      markers.add(ring, sp);
    },
    clearMarkers() {
      for (const c of [...markers.children]) {
        markers.remove(c);
        if (c.isSprite) {
          c.material.map.dispose();
          c.material.dispose();
        }
      }
    },
    ...(w.extra || {}),
    stats: () => ({
      colliders: colliders.stats(),
      buildMs: t1 - t0,
      lights: lights.spots.length,
      motes: motes ? motes.pts.geometry.attributes.position.count : 0,
      ...(w.stats ? w.stats() : {}),
      defects: defects.list().length,
      defectSeed: defects.seed(),
    }),
    dispose() {
      w.restore();
      scene.onBeforeRender = () => {};
      post.dispose();
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
    },
  };
}
