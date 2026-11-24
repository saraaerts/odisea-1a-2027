import * as T from 'three';
import { seeded } from './model.ts';
import type { VisualQuality } from './cabin.ts';
import type { CabinFrame } from './classic.ts';

type Particle = { x: number; y: number; z: number; size: number; alpha: number; color: T.Color };
type Formation = ReadonlyArray<{ x: number; y: number; z: number }>;

const ember = new T.Color('#ffb24d');
const flame = new T.Color('#fa5329');
const smoke = new T.Color('#3d3b41');
const rush = new T.Color('#74c9ff');

function particles(limit: number, additive: boolean) {
  const positions = new Float32Array(limit * 3);
  const colors = new Float32Array(limit * 3);
  const sizes = new Float32Array(limit);
  const alphas = new Float32Array(limit);
  const geometry = new T.BufferGeometry();
  const position = new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage);
  const color = new T.BufferAttribute(colors, 3).setUsage(T.DynamicDrawUsage);
  const size = new T.BufferAttribute(sizes, 1).setUsage(T.DynamicDrawUsage);
  const alpha = new T.BufferAttribute(alphas, 1).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  geometry.setAttribute('size', size);
  geometry.setAttribute('alpha', alpha);
  const material = new T.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 }, softened: { value: additive ? .55 : .84 } },
    transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
    vertexShader: `attribute vec3 color;attribute float size;attribute float alpha;uniform float pixelRatio;varying vec4 tint;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(size*pixelRatio/max(.8,-mv.z),1.,120.);tint=vec4(color,alpha);}`,
    fragmentShader: `varying vec4 tint;uniform float softened;
      void main(){float r=length(gl_PointCoord-.5)*2.;
      float a=1.-smoothstep(.03,1.,r);float f=pow(a,softened);
      gl_FragColor=vec4(tint.rgb,tint.a*f);}`,
  });
  const object = new T.Points(geometry, material);
  object.frustumCulled = false;
  return {
    object,
    update(items: Particle[], pixelRatio: number) {
      const count = Math.min(limit, items.length);
      for (let i = 0; i < count; i++) {
        const p = items[i];
        position.setXYZ(i, p.x, p.y, p.z);
        color.setXYZ(i, p.color.r, p.color.g, p.color.b);
        sizes[i] = p.size;
        alphas[i] = p.alpha;
      }
      position.needsUpdate = color.needsUpdate = size.needsUpdate = alpha.needsUpdate = true;
      material.uniforms.pixelRatio.value = pixelRatio;
      geometry.setDrawRange(0, count);
      object.visible = count > 0;
    },
  };
}

function warpLines(limit: number) {
  const geometry = new T.BufferGeometry();
  const positions = new T.BufferAttribute(new Float32Array(limit * 6), 3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  const material = new T.LineBasicMaterial({ color: rush, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
  const object = new T.LineSegments(geometry, material);
  object.frustumCulled = false;
  const random = seeded(207);
  const streaks = Array.from({ length: limit }, () => ({ theta: random() * Math.PI * 2, radius: 2.9 + random() * 25, offset: random() }));
  return {
    object,
    update(progress: number, count: number) {
      object.visible = progress > 0;
      if (!object.visible) return;
      material.opacity = Math.min(.73, Math.sin(progress * Math.PI) * .76);
      for (let i = 0; i < count; i++) {
        const { theta, radius, offset } = streaks[i];
        const z = -3 - ((1 - progress) * 3 + offset) % 1 * 73;
        const length = 1.4 + Math.abs(z) * .19 + Math.sin(progress * Math.PI) * 10;
        const x = Math.cos(theta) * radius;
        const y = 1.3 + Math.sin(theta) * radius;
        positions.setXYZ(i * 2, x, y, z);
        positions.setXYZ(i * 2 + 1, x, y, z - length);
      }
      geometry.setDrawRange(0, count * 2);
      positions.needsUpdate = true;
    },
  };
}

export function makeEffects(formation: Formation) {
  const object = new T.Group();
  const hazy = particles(250, false);
  const glowing = particles(490, true);
  const warp = warpLines(220);
  const light = new T.PointLight('#ff6336', 0, 8, 2);
  light.position.set(2.65, .54, -2.68);
  object.add(hazy.object, glowing.object, warp.object, light);
  const random = seeded(10042027);
  const noise = Array.from({ length: 64 }, () => ({ x: random() - .5, y: random(), z: random() - .5 }));
  const bursts: { at: number; x: number; y: number; z: number }[] = [];
  let previousFleet: number | undefined;
  let previousHull: number | undefined;
  let previousStage: number | undefined;
  let hitAt = -Infinity;
  let warpAt = -Infinity;

  function update(frame: CabinFrame, now: number, quality: VisualQuality, reduced: boolean, intense: boolean, pixelRatio: number) {
    const density = quality === 'high' ? 1 : quality === 'medium' ? .58 : .27;
    const fireParticles: Particle[] = [];
    const smokeParticles: Particle[] = [];
    if (!reduced) {
      if (previousStage !== undefined && previousStage !== frame.stage && frame.stage > 0) warpAt = now;
      if (previousHull !== undefined && previousHull > frame.hull) hitAt = now;
      if (previousFleet !== undefined && frame.fleet < previousFleet) {
        for (let index = Math.max(frame.fleet, previousFleet - 10); index < Math.min(previousFleet, formation.length); index++) {
          bursts.push({ at: now + Math.min(bursts.length, 6) * 45, ...formation[index] });
        }
      }
    } else {
      bursts.length = 0;
      warpAt = hitAt = -Infinity;
    }
    previousFleet = frame.fleet;
    previousHull = frame.hull;
    previousStage = frame.stage;

    const hitAge = (now - hitAt) / 1000;
    const warpAge = (now - warpAt) / 1350;
    const fireCount = Math.min(12, frame.fires);
    const seconds = reduced ? .26 : now / 1000;
    light.visible = intense && fireCount > 0 && quality !== 'low';
    light.intensity = light.visible ? Math.min(17, 6 + fireCount * 1.1 + Math.sin(seconds * 8)) : 0;
    if (intense) for (let i = 0; i < fireCount; i++) {
      const x = (i % 2 === 0 ? 1 : -1) * (2.7 + (i % 3) * .41);
      const z = -2.7 + Math.floor(i / 2) * .81;
      const y = .34 - Math.floor(i / 4) * .15;
      for (let j = 0; j < Math.max(5, 21 * density); j++) {
        const n = noise[(j + i * 9) % noise.length];
        const age = (seconds * (1.9 + n.y * .57) + j * .165) % 1;
        fireParticles.push({ x: x + n.x * (.25 + age * .21), y: y + age * .74,
          z: z + n.z * .38, size: 170 * (1 - age * .8), alpha: (1 - age) * .71, color: j % 3 ? flame : ember });
      }
      for (let j = 0; j < 11 * density; j++) {
        const n = noise[(j + i * 11 + 31) % noise.length];
        const age = (seconds * .63 + j * .111) % 1;
        smokeParticles.push({ x: x + n.x * (.24 + age * .94), y: y + .34 + age * 1.21,
          z: z + n.z * .39, size: 50 + age * 220, alpha: .37 * (1 - age), color: smoke });
      }
    }
    if (hitAge < .51 && !reduced) {
      for (let i = 0; i < 24 * density; i++) {
        const n = noise[i];
        const side = i % 2 ? -1 : 1;
        fireParticles.push({ x: side * (3.4 + n.x + n.z * hitAge * 4), y: .6 + n.y * hitAge * 4 - hitAge ** 2 * 4,
          z: -2.7 + n.z * 1.2 + hitAge, size: 30, alpha: 1 - hitAge * 1.85, color: ember });
      }
    }
    while (bursts.length && now - bursts[0].at > 800) bursts.shift();
    for (const burst of bursts) {
      const age = (now - burst.at) / 800;
      if (age < 0) continue;
      for (let i = 0; i < 19 * density; i++) {
        const n = noise[i];
        fireParticles.push({ x: burst.x + n.x * age * 2.6, y: burst.y + (n.y - .5) * age * 2.8,
          z: burst.z + n.z * age * 4, size: 58 + (1 - age) * 120, alpha: (1 - age) * .89, color: i % 2 ? flame : ember });
      }
    }
    hazy.update(smokeParticles, pixelRatio);
    glowing.update(fireParticles, pixelRatio);
    warp.update(warpAge > 0 && warpAge < 1 ? warpAge : 0, Math.ceil(220 * density));
    return { hit: reduced ? 0 : Math.max(0, 1 - hitAge * 2.4), warp: warpAge > 0 && warpAge < 1 ? Math.sin(warpAge * Math.PI) : 0 };
  }
  return { object, update };
}
