import * as T from 'three';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import type { Avatar } from '../config.ts';
import { metal, piece } from './model.ts';
import { portraitBounds, portraitColor, portraitDepth, portraitTone } from './retro-portrait-data.ts';

const [left, top, right, bottom] = portraitBounds;
const source = { x: 638, y: 611, scaleX: .00047, scaleY: .000387, eyeY: .027 };
const colorWidth = 256, colorHeight = 320;
const depthWidth = 128, depthHeight = 160;
const baseTone = new T.Color().setRGB(portraitTone[0] / 255, portraitTone[1] / 255, portraitTone[2] / 255, T.SRGBColorSpace);
const ear = new T.SphereGeometry(1, 18, 12);
const point = new T.Vector3();
const vector = new T.Vector3();
let pixels: { color: Uint8Array; depth: Float32Array; clean?: Uint8Array } | undefined;

const contours = [
  [-.208, .001, .045, .026],
  [-.199, .065, .105, .054],
  [-.175, .105, .128, .078],
  [-.130, .127, .143, .105],
  [-.073, .146, .148, .128],
  [-.016, .161, .151, .144],
  [.043, .166, .148, .151],
  [.107, .162, .147, .151],
  [.174, .144, .130, .143],
  [.225, .090, .076, .093],
  [.245, .001, .002, .002],
] as const;

function portraitPixels() {
  if (!pixels) {
    const decode = (str: string) => gunzipSync(Uint8Array.from(atob(str), c => c.charCodeAt(0)));
    pixels = { color: decode(portraitColor), depth: smoothRelief(decode(portraitDepth)) };
  }
  return pixels;
}

function smoothRelief(original: Uint8Array) {
  const output = new Float32Array(original.length);
  // Promedia el borde de las aberturas entre los puntos del retrato, sin tomar sus muestras vacías como profundidad.
  const kernel = [1, 4, 6, 4, 1] as const;
  for (let row = 2; row < depthHeight - 2; row++) for (let col = 2; col < depthWidth - 2; col++) {
    let total = 0, weightedDepth = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const sample = ((row + dy) * depthWidth + col + dx) * 2;
      const weight = original[sample + 1] * kernel[dy + 2] * kernel[dx + 2];
      weightedDepth += original[sample] * weight;
      total += weight;
    }
    const i = (row * depthWidth + col) * 2;
    output[i] = total > 0 ? weightedDepth / total : 0;
    output[i + 1] = total / 256;
  }
  return output;
}

function softenedPigment(color: Uint8Array) {
  const cleaned = color.slice();
  for (let row = 2; row < colorHeight - 2; row++) for (let col = 2; col < colorWidth - 2; col++) {
    const x = T.MathUtils.lerp(left, right, col / (colorWidth - 1));
    const y = T.MathUtils.lerp(top, bottom, row / (colorHeight - 1));
    const cheeks = Math.exp(-(((Math.abs(x - 638) - 165) / 105) ** 2 + ((y - 761) / 95) ** 2));
    if (cheeks < .10) continue;
    const i = (row * colorWidth + col) * 4;
    for (let ch = 0; ch < 3; ch++) {
      const neighbor = (color[i - 8 + ch] + color[i + 8 + ch]
        + color[i - colorWidth * 8 + ch] + color[i + colorWidth * 8 + ch]) * .25;
      cleaned[i + ch] += Math.max(0, neighbor - color[i + ch]) * cheeks * .68;
    }
  }
  return cleaned;
}

function colorMaterial(avatar: Avatar, closeup: boolean) {
  const data = portraitPixels();
  const color = avatar.detalle === 1 ? data.color : (data.clean ??= softenedPigment(data.color));
  const map = new T.DataTexture(color, colorWidth, colorHeight);
  map.colorSpace = T.SRGBColorSpace;
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return new T.MeshStandardMaterial({ map, vertexColors: true, roughness: closeup ? .69 : .80 });
}

function profile(y: number) {
  const next = contours.findIndex(ring => ring[0] >= y);
  const i = next < 0 ? contours.length - 1 : Math.max(1, next);
  const a = contours[i - 1], b = contours[i];
  const p = contours[Math.max(0, i - 2)], q = contours[Math.min(contours.length - 1, i + 1)];
  const h = b[0] - a[0];
  const t = T.MathUtils.clamp((y - a[0]) / h, 0, 1);
  const t2 = t * t, t3 = t2 * t;
  return ([1, 2, 3] as const).map(channel => {
    const d0 = (b[channel] - p[channel]) * h / (b[0] - p[0]);
    const d1 = (q[channel] - a[channel]) * h / (q[0] - a[0]);
    return (2 * t3 - 3 * t2 + 1) * a[channel] + (t3 - 2 * t2 + t) * d0
      + (-2 * t3 + 3 * t2) * b[channel] + (t3 - t2) * d1;
  });
}

function photoUV(x: number, y: number): [number, number] {
  return [(source.x - x / source.scaleX - left) / (right - left),
    (source.y + (source.eyeY - y) / source.scaleY - top) / (bottom - top)];
}

function blendDepth(u: number, v: number, base: number, front: number) {
  if (front <= 0 || u <= 0 || u >= 1 || v <= 0 || v >= 1) return base;
  const depth = portraitPixels().depth;
  const x = u * (depthWidth - 1), y = v * (depthHeight - 1);
  const row = Math.floor(y), col = Math.floor(x);
  const i = (row * depthWidth + col) * 2, step = depthWidth * 2;
  const sample = (channel: number) => T.MathUtils.lerp(
    T.MathUtils.lerp(depth[i + channel], depth[i + 2 + channel], x - col),
    T.MathUtils.lerp(depth[i + step + channel], depth[i + step + 2 + channel], x - col), y - row,
  );
  const measured = -.126 + (sample(0) * 600 / 255 - 210) * .00039;
  const forehead = T.MathUtils.smoothstep(v, .11, .34);
  const weight = sample(1) / 255 * T.MathUtils.smoothstep(front, .19, .56) * forehead;
  return T.MathUtils.lerp(base, measured, weight * .9);
}

function deform(avatar: Avatar, x: number, y: number, z: number, front: number): [number, number, number] {
  const custom = avatar.custom;
  const detail = (weight: number | undefined) => (weight ?? 0) * .5;
  const side = Math.sign(x), ax = Math.abs(x);
  const local = (cx: number, cy: number, width: number, height: number) =>
    Math.exp(-(((ax - cx) / width) ** 2 + ((y - cy) / height) ** 2));
  const jaw = detail(custom?.jaw) * local(.075, -.156, .10, .068);
  const cheek = detail(custom?.cheek) * local(.108, -.037, .047, .056);
  const eye = detail(custom?.eyes);
  const eyelid = local(.076, .027, .053, .034);
  const brow = detail(custom?.brows) * local(.077, .067, .060, .029);
  const nose = detail(custom?.nose) * local(.004, -.051, .048, .061);
  const lips = detail(custom?.lips) * local(.023, -.106, .061, .033);
  const expression = avatar.cara;
  const squint = expression === 3 && side > 0 ? -.87 :
    expression === 2 ? -.29 : expression === 4 ? .28 : expression === 6 ? -.19 : 0;
  const smile = expression === 1 ? .013 : expression === 5 ? .009 * side : expression === 6 ? -.007 : 0;
  const mouth = local(.033, -.106, .055, .044);
  const corner = Math.min(1, ax / .063);
  const fromSeam = y + .106 - corner ** 2 * .007;
  const open = (expression === 1 ? .011 : expression === 4 ? .015 : 0)
    * (1 - T.MathUtils.smoothstep(corner, .45, 1)) * Math.exp(-((fromSeam / .036) ** 2));
  const eyeCenterX = side * .076;
  return [
    x + x * (jaw * .25 + cheek * .15) + front * (
      (x - eyeCenterX) * eye * eyelid * .35 + x * (nose * .23 + lips * .22) - x * open * 8),
    y - .010 * jaw + front * ((y - .027) * (.63 * eye + squint) * eyelid
      + .016 * brow - .010 * nose + (y + .105) * .72 * lips * mouth
      + smile * corner * mouth + open * T.MathUtils.clamp(fromSeam / .004, -1, 1)),
    z - front * (.010 * cheek + .022 * nose + .009 * lips + .0035 * eye * eyelid),
  ];
}

export function retroPortrait(parent: T.Group, avatar: Avatar, skin: T.MeshStandardMaterial,
  hair: T.MeshStandardMaterial, closeup: boolean) {
  const positions: number[] = [], coords: number[] = [], tones: number[] = [], triangles: number[] = [];
  const rows = closeup ? 90 : 37, sides = closeup ? 100 : 50;
  const [base] = contours[0], [topY] = contours.at(-1)!;
  const tint = new T.Color(skin.color.r / baseTone.r, skin.color.g / baseTone.g, skin.color.b / baseTone.b);
  const surface = (x: number, y: number, width: number, frontRadius: number) => {
    const frontal = Math.sqrt(Math.max(0, 1 - (x / width) ** 2));
    const [u, v] = photoUV(x, y);
    // La textura y el relieve usan los mismos puntos y se deforman juntos con el perfil.
    return blendDepth(u, v, -frontal * frontRadius, frontal);
  };
  for (let row = 0; row <= rows; row++) {
    const y = T.MathUtils.lerp(base, topY, row / rows);
    const [width, frontRadius, backRadius] = profile(y);
    for (let side = 0; side <= sides; side++) {
      const angle = (side / sides - .5) * Math.PI * 2;
      const x = Math.sin(angle) * width;
      const front = Math.cos(angle);
      const z = front > 0 ? surface(x, y, width, frontRadius) : -front * backRadius;
      positions.push(...deform(avatar, x, y, z, Math.max(0, front)));
      coords.push(...(front > 0 ? photoUV(x, y) : [0, 0]));
      const eye = Math.exp(-(((Math.abs(x) - .076) / .047) ** 2 + ((y - .027) / .017) ** 2));
      const lip = Math.exp(-((x / .066) ** 2 + ((y + .106) / .021) ** 2));
      // Atenuá el tinte en el iris, la esclerótica y los labios para conservar sus matices.
      const natural = Math.max(eye * .82, lip * .34) * Math.max(0, front);
      tones.push(T.MathUtils.lerp(tint.r, 1, natural), T.MathUtils.lerp(tint.g, 1, natural), T.MathUtils.lerp(tint.b, 1, natural));
      if (!row || !side) continue;
      const a = (row - 1) * (sides + 1) + side - 1, b = a + sides + 1;
      triangles.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const head = new T.BufferGeometry();
  head.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  head.setAttribute('uv', new T.Float32BufferAttribute(coords, 2));
  head.setAttribute('color', new T.Float32BufferAttribute(tones, 3));
  head.setIndex(triangles);
  head.computeVertexNormals();
  const normals = head.attributes.normal;
  for (let row = 0; row <= rows; row++) {
    const first = row * (sides + 1), last = first + sides;
    point.fromBufferAttribute(normals, first).add(vector.fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, point.x, point.y, point.z);
    normals.setXYZ(last, point.x, point.y, point.z);
  }
  piece(parent, head, colorMaterial(avatar, closeup), 0, 0, 0, 1, 1, 1);
  const earShadow = metal(skin.color.clone().lerp(new T.Color('#5c2f21'), .35), .84, 0);
  for (const direction of [-1, 1]) {
    const rim = piece(parent, ear, skin, direction * .157, -.025, .018, .022, .043, .025);
    rim.rotation.z = direction * -.2;
    const concha = piece(parent, ear, earShadow, direction * .169, -.022, .002, .011, .026, .0095);
    concha.rotation.z = direction * -.26;
  }

  const spot = (x: number, y: number, w: number, h: number, material: T.Material) => {
    const [width, frontRadius] = profile(y);
    const [px, py, pz] = deform(avatar, x, y, surface(x, y, width, frontRadius), 1);
    const mark = piece(parent, ear, material, px, py, pz - .0012, w, h, .0028);
    mark.rotation.y = -x * 4.5;
    return mark;
  };
  if (avatar.detalle === 2 || avatar.detalle === 3) {
    for (const direction of [-1, 1]) spot(direction * .023, -.088, .027, .006, hair).rotation.z = direction * -.14;
  }
  if (avatar.detalle === 3 || avatar.detalle === 4) {
    for (let i = -3; i <= 3; i++) spot(i * .019, -.175 + Math.abs(i) * .006, .019, .023, hair).rotation.z = i * -.06;
  }
  if (avatar.detalle === 5) spot(.105, -.071, .0031, .0035, hair);
  if (avatar.detalle === 6) spot(.102, -.065, .018, .006, metal(skin.color.clone().lerp(new T.Color('#e6b089'), .64), .83, 0)).rotation.z = .36;
  return [head];
}
