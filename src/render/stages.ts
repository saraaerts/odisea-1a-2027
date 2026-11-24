import * as T from 'three';
import type { SceneId } from '../config.ts';
import { batch, beam, box, cylinder, lamp, metal, piece, seeded, sphere } from './model.ts';
import { makeStation } from './space.ts';

const circle = Math.PI * 2;

export interface SpaceStage {
  object: T.Group;
  animate(seconds: number): void;
}

function cloudMap(seed: number, storm: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = seeded(seed);
  const shades = storm ? ['90,74,165', '145,122,224', '30,105,182'] : ['95,75,232', '41,158,200', '199,82,147'];
  for (let i = 0; i < 140; i++) {
    const x = 56 + random() * 400;
    const y = 127 + Math.sin(x * .017) * 29 + (random() - .5) * 92;
    const radius = 9 + random() * 72;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const tint = shades[i % shades.length];
    gradient.addColorStop(0, `rgba(${tint},${.05 + random() * .26})`);
    gradient.addColorStop(.38, `rgba(${tint},.08)`);
    gradient.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function makeCloud(storm: boolean): SpaceStage {
  const object = new T.Group();
  const texture = cloudMap(storm ? 923 : 115, storm);
  const tint = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: T.DoubleSide });
  const geometry = new T.PlaneGeometry(24, 12);
  const sheets = Array.from({ length: 3 }, (_, i) => {
    const layer = piece(object, geometry, tint, (i - 1) * 2, i * .56 - .6, -i * 2.8, 1, 1, 1);
    layer.rotation.set(.2 + i * .2, -.26 * i, -.16 + i * .13);
    return layer;
  });
  if (storm) {
    const coords = [
      [-7, 2.8, -1], [-4, 1.3, 0], [-2.9, 1.7, -.4], [-.5, -.5, 0], [.8, -.2, .1], [3, -2.5, .3],
      [3, 3.4, -.5], [4.4, 1.8, .1], [5.3, 2.1, -.4], [6.6, .8, .5], [8.2, .3, -.1],
    ].map(([x, y, z]) => new T.Vector3(x, y, z));
    const boltMaterial = lamp('#b7a9ff', 2.4);
    for (const branch of [coords.slice(0, 6), coords.slice(6), [coords[2], new T.Vector3(-1.2, 2.8, .2), new T.Vector3(.6, 2.2, -.4)]]) {
      const tube = new T.TubeGeometry(new T.CatmullRomCurve3(branch, false, 'catmullrom', 0), branch.length * 2, .032, 4, false);
      object.add(new T.Mesh(tube, boltMaterial));
    }
    const sheets = new T.Group();
    const paper = metal('#c1cdde', .64, .13);
    const dark = metal('#415e82');
    for (let i = 0; i < 5; i++) {
      const fragment = new T.Group();
      fragment.position.set((i - 2) * 2.55, Math.sin(i * 2) * 2.9, 1 + (i % 2) * 1.2);
      fragment.rotation.set(.5 + i * .24, .68 + i * .17, i * .68);
      sheets.add(fragment);
      piece(fragment, box, paper, 0, 0, 0, .56, .78, .035);
      for (let line = 0; line < 4; line++) piece(fragment, box, dark, -.018, .22 - line * .13, .025, .4, .017, .009);
    }
    object.add(batch(sheets));
  }
  return { object, animate(t) { sheets.forEach((layer, i) => { layer.rotation.z = -.21 + i * .17 + Math.sin(t * (.09 + i * .01)) * .07; }); } };
}

function gasSurface() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = seeded(719);
  ctx.fillStyle = '#6e9aaf';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 120; i++) {
    const y = random() * 256;
    ctx.strokeStyle = i % 4 ? `rgba(20,54,83,${.04 + random() * .25})` : `rgba(241,208,166,${.04 + random() * .3})`;
    ctx.lineWidth = .8 + random() * 5.7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(149, y + Math.sin(y) * 8, 380, y + Math.cos(y) * 6, 512, y);
    ctx.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function makeWorld(hole: boolean): SpaceStage {
  const object = new T.Group();
  const bands = new T.Group();
  bands.rotation.set(1.12, .15, -.43);
  object.add(bands);
  const random = seeded(hole ? 2201 : 757);
  const shades = hole ? ['#f97238', '#ffbc74', '#bd4151', '#ffe1ab'] : ['#718fab', '#abd4d9', '#d1b99a', '#6e88ac'];
  for (let i = 0; i < (hole ? 15 : 13); i++) {
    const radius = (hole ? 3.35 : 4.33) + i * .223;
    const geometry = new T.RingGeometry(radius, radius + .045 + random() * .15, 64);
    const material = new T.MeshBasicMaterial({ color: shades[i % 4], side: T.DoubleSide,
      transparent: true, opacity: .25 + random() * .61, depthWrite: false });
    bands.add(new T.Mesh(geometry, material));
  }
  const texture = hole ? undefined : gasSurface();
  const body = piece(object, sphere, hole ? lamp('#010207') : new T.MeshStandardMaterial({ map: texture, roughness: .77 }), 0, 0, 0, 3.05, 3.05, 3.05);
  if (hole) {
    const lens = new T.TorusGeometry(3.16, .054, 5, 86);
    const edge = new T.MeshBasicMaterial({ color: '#ffd09a', transparent: true, opacity: .77, toneMapped: false });
    object.add(new T.Mesh(lens, edge));
    const orbit = piece(object, new T.TorusGeometry(3.42, .12, 7, 72, Math.PI * 1.43), lamp('#dc763f'), .06, .03, .02, 1, 1, 1);
    orbit.rotation.z = .19;
  }
  return { object, animate(t) { body.rotation.y = .16 + t * .049; bands.rotation.z = -.43 + Math.sin(t * .13) * .06; } };
}

function rockGeometry(seed: number) {
  const geometry = new T.IcosahedronGeometry(1, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const d = .75 + Math.sin(x * 5.1 + y * 4.3 + z * 3.4 + seed) * .14 + Math.cos(y * 8.2 - z * 6.2 + seed) * .13;
    position.setXYZ(i, x * d, y * d, z * d);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeRocks(belt: boolean): SpaceStage {
  const object = new T.Group();
  const random = seeded(belt ? 1812 : 5581);
  const material = metal('#a39993', .9, .05);
  const dummy = new T.Object3D();
  const shades = belt ? ['#a7aeb5', '#87939d', '#a9a29d'] : ['#ab8879', '#968b91', '#b69d91'];
  const meshes = Array.from({ length: 3 }, (_, variant) => {
    const count = belt ? 29 : 17;
    const rocks = new T.InstancedMesh(rockGeometry(variant * 3.7), material, count);
    rocks.frustumCulled = false;
    const positions = Array.from({ length: count }, (_, i) => {
      const x = (random() - .5) * 20;
      const y = belt ? x * -.28 + (random() - .5) * 3 : (random() - .5) * 10;
      const z = (random() - .65) * 9;
      const radius = belt ? .14 + random() ** 2 * .59 : (i < 2 ? 1.07 : .2) + random() ** 2 * (i < 2 ? 1.25 : .62);
      rocks.setColorAt(i, new T.Color(shades[variant]).multiplyScalar(.45 + random() * .65));
      return { x, y, z, radius, phase: random() * circle };
    });
    object.add(rocks);
    return { rocks, positions };
  });
  if (belt) {
    const planet = piece(object, sphere, metal('#658097', .92, .08), -.4, 1, -4.4, 2.2, 2.2, 2.2);
    planet.rotation.x = .3;
  }
  return { object, animate(t) {
    for (const { rocks, positions } of meshes) {
      positions.forEach(({ x, y, z, radius, phase }, i) => {
        dummy.position.set(x + Math.sin(t * .24 + phase) * .35, y + Math.cos(t * .21 + phase) * .26, z);
        dummy.rotation.set(t * .16 + phase, t * .11 + phase, t * -.14);
        dummy.scale.set(radius, radius * .73, radius * .88);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
      });
      rocks.instanceMatrix.needsUpdate = true;
    }
  } };
}

function makeGate(): SpaceStage {
  const structure = new T.Group();
  const frame = metal('#829cac', .36, .62);
  const plate = metal('#223b56', .5, .52);
  const emitter = lamp('#8febfa', 1.4);
  const rim = new T.TorusGeometry(4.9, .28, 7, 8);
  const trim = new T.TorusGeometry(4.53, .066, 6, 8);
  piece(structure, rim, frame, 0, 0, 0, 1, 1, 1).rotation.z = Math.PI / 8;
  piece(structure, trim, emitter, 0, 0, .29, 1, 1, 1).rotation.z = Math.PI / 8;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + Math.PI / 8;
    const arm = new T.Group();
    arm.rotation.z = angle;
    structure.add(arm);
    piece(arm, box, plate, 0, 4.91, .06, 1.33, .98, 1.56);
    piece(arm, box, frame, 0, 5.31, .34, .86, 1.65, .79);
    piece(arm, box, emitter, 0, 4.92, .863, .72, .21, .07);
    beam(arm, frame, [-.64, 4.88, .73], [-1.35, 4.88, .32], .25);
    beam(arm, frame, [.64, 4.88, .73], [1.35, 4.88, .32], .25);
  }
  const object = new T.Group();
  object.add(batch(structure));
  rim.dispose();
  trim.dispose();
  const glow = new T.ShaderMaterial({
    uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, side: T.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv; uniform float time;
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,p.x);
      float edge=smoothstep(.45,.95,r);float spiral=.5+.5*sin(30.*r-3.*a+time);
      vec3 color=mix(vec3(.035,.12,.39),vec3(.2,.73,1.),edge+spiral*.28);
      gl_FragColor=vec4(color,(1.-smoothstep(.95,1.,r))*(.22+edge*.7+spiral*.22));}`,
  });
  piece(object, new T.PlaneGeometry(9.25, 9.25), glow, 0, 0, -.35, 1, 1, 1);
  object.rotation.set(.14, -.24, -.12);
  return { object, animate(t) { glow.uniforms.time.value = t * .65; } };
}

export function makeStage(id: SceneId): SpaceStage {
  if (id === 'belt' || id === 'rocks') return makeRocks(id === 'belt');
  if (id === 'hole' || id === 'ringed') return makeWorld(id === 'hole');
  if (id === 'storm' || id === 'nebula') return makeCloud(id === 'storm');
  if (id === 'gate') return makeGate();
  const object = makeStation();
  return { object, animate(t) {
    object.rotation.z = -.26 + Math.sin(t * .42) * .15;
    object.rotation.y = -.48 + Math.sin(t * .31) * .09;
  } };
}
