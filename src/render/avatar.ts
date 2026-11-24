/**
 * Odisea 1A 2027 · Tripulación facetada, estilo 05.
 * Archivo para src/render/avatar.ts. Usa Three.js, config.ts y model.ts del juego.
 */
import * as T from 'three';
import { AVATAR_OPTIONS, cleanAvatar, type Avatar } from '../config.ts';
import { batch, beam, box as block, piece } from './model.ts';
import type { CabinEffect } from './cabin.ts';

type V = [number, number, number];
// Ajustes finos opcionales. El vestuario de Odisea todavía no los guarda, así que hoy no vienen.
type AvatarColorKey = 'skin' | 'hair' | 'suit' | 'hat' | 'glasses' | 'accessory';
type Custom = Partial<Record<AvatarColorKey, string> & Record<'jaw' | 'cheek' | 'eyes' | 'brows' | 'nose' | 'lips', number>>;
const custom = (a: Avatar) => (a as Avatar & { custom?: Custom }).custom;
type Layer = { y: number; w: number; front: number; back: number };
type Paint = T.MeshStandardMaterial;
type Palette = Record<'skin' | 'hair' | 'suit' | 'trim' | 'cyan' | 'mint' | 'hat' |
  'glasses' | 'accessory' | 'ink' | 'white' | 'gold', Paint>;

export const REFERENCE_AVATAR = cleanAvatar({
  pelo: 3, colorPelo: 1, piel: 2, ropa: 4, colorRopa: 3,
  colorGorro: 3, acc: 2, colorAcc: 1, lentes: 1, colorLentes: 0,
});

export const crewSeats = [
  [-1.75, -.42, -1.05], [1.75, -.42, -1.05],
  [-2.54, -.4, 2.08], [2.54, -.4, 2.08],
] as const;

const poly = new T.IcosahedronGeometry(1, 0);
const round = new T.SphereGeometry(1, 6, 3);
const tube = new T.CylinderGeometry(1, 1, 1, 8);
const opaque = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .82, metalness: 0 });
const visor = new T.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: .78, metalness: 0,
  opacity: .76, transparent: true, depthWrite: false,
});

// Materiales para asignar los colores al construir. En pantalla se usan solo
// el material opaco y, si corresponde, el del visor, con color por vértice.
const colors = new Map<string, Paint>();
class Kit {
  private readonly temporary = new Set<T.BufferGeometry>();

  color(value: T.ColorRepresentation) {
    const color = new T.Color(value);
    const key = color.getHexString();
    const cached = colors.get(key);
    if (cached) return cached;
    const material = new T.MeshStandardMaterial({ color, flatShading: true, roughness: .82, metalness: 0 });
    colors.set(key, material);
    if (colors.size > 96) {
      const oldest = colors.keys().next().value!;
      colors.get(oldest)!.dispose();
      colors.delete(oldest);
    }
    return material;
  }

  shade(base: Paint, lightness: number) {
    return this.color(base.color.clone().offsetHSL(0, 0, lightness));
  }

  geo(geometry: T.BufferGeometry) {
    this.temporary.add(geometry);
    return geometry;
  }

  add(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material,
    position: V, scale: V = [1, 1, 1], rotation: V = [0, 0, 0]) {
    const mesh = piece(parent, geometry, material, ...position, ...scale);
    mesh.rotation.set(...rotation);
    return mesh;
  }

  link(parent: T.Object3D, material: T.Material, from: V, to: V, width: number, depth = width) {
    return beam(parent, material, from, to, width, depth);
  }

  visorMesh(parent: T.Object3D, geometry: T.BufferGeometry, color: Paint) {
    const mesh = this.add(parent, geometry, color, [0, 0, 0]);
    mesh.userData.visor = true;
    return mesh;
  }

  mesh(points: readonly V[], faces: readonly (readonly number[])[]) {
    const vertices: number[] = [];
    const ab = new T.Vector3(), ac = new T.Vector3(), origin = new T.Vector3();
    for (const face of faces) {
      const a = points[face[0]];
      origin.set(...a);
      for (let i = 1; i + 1 < face.length; i++) {
        const b = points[face[i]], c = points[face[i + 1]];
        ab.set(...b).sub(origin);
        ac.set(...c).sub(origin);
        if (ab.cross(ac).lengthSq() > 1e-16) vertices.push(...a, ...b, ...c);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return this.geo(geometry);
  }

  layers(layers: readonly Layer[], sides = 8) {
    const rows = [...layers].sort((a, b) => a.y - b.y);
    const vertices: V[] = [], faces: number[][] = [];
    rows.forEach((row, height) => {
      for (let i = 0; i < sides; i++) {
        const angle = i * Math.PI * 2 / sides, z = -Math.cos(angle);
        vertices.push([Math.sin(angle) * row.w, row.y, z * (z < 0 ? row.front : row.back)]);
        if (height > 0) {
          const a = (height - 1) * sides + i, b = (height - 1) * sides + (i + 1) % sides;
          faces.push([a, a + sides, b + sides, b]);
        }
      }
    });
    faces.push(Array.from({ length: sides }, (_, i) => i));
    faces.push(Array.from({ length: sides }, (_, i) => vertices.length - 1 - i));
    return this.mesh(vertices, faces);
  }

  // Normalizá las mallas para batch() y unificá los colores por material.
  combine(source: T.Group) {
    source.updateMatrixWorld(true);
    const painted = new T.Group();
    source.traverse(part => {
      if (!(part instanceof T.Mesh) || !(part.material instanceof T.MeshStandardMaterial)) return;
      const geometry = this.geo(part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone());
      for (const attribute of Object.keys(geometry.attributes)) {
        if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
      }
      geometry.applyMatrix4(part.matrixWorld);
      const length = geometry.getAttribute('position').count;
      const rgb = new Float32Array(length * 3);
      for (let i = 0; i < length; i++) part.material.color.toArray(rgb, i * 3);
      geometry.setAttribute('color', new T.BufferAttribute(rgb, 3));
      painted.add(new T.Mesh(geometry, part.userData.visor ? visor : opaque));
    });
    return batch(painted);
  }

  done() {
    this.temporary.forEach(geometry => geometry.dispose());
    this.temporary.clear();
  }
}

function palette(k: Kit, a: Avatar): Palette {
  const tint = (field: AvatarColorKey, options: 'piel' | 'colorPelo' | 'colorRopa' | 'colorGorro' | 'colorLentes' | 'colorAcc') =>
    k.color(custom(a)?.[field] ?? AVATAR_OPTIONS[options][a[options]]);
  return {
    skin: tint('skin', 'piel'), hair: tint('hair', 'colorPelo'), suit: tint('suit', 'colorRopa'),
    hat: tint('hat', 'colorGorro'), glasses: tint('glasses', 'colorLentes'), accessory: tint('accessory', 'colorAcc'),
    trim: k.color(AVATAR_OPTIONS.colorRopa[3]), cyan: k.color(AVATAR_OPTIONS.colorRopa[1]),
    mint: k.color(AVATAR_OPTIONS.colorRopa[2]), ink: k.color(AVATAR_OPTIONS.colorLentes[0]),
    white: k.color(AVATAR_OPTIONS.colorRopa[8]), gold: k.color(AVATAR_OPTIONS.colorRopa[4]),
  };
}

// Vista frontal local: -Z. Las facetas grandes del cráneo sostienen todos los rasgos.
function addFace(k: Kit, head: T.Group, a: Avatar, p: Palette) {
  const jaw = (custom(a)?.jaw ?? 0) * .009;
  const cheek = (custom(a)?.cheek ?? 0) * .006;
  const eyes = (custom(a)?.eyes ?? 0) * .002;
  const brows = (custom(a)?.brows ?? 0) * .005;
  const nose = (custom(a)?.nose ?? 0) * .004;
  const lips = (custom(a)?.lips ?? 0) * .0015;
  const rows: Layer[] = [
    { y: -.209, w: .062 + jaw, front: .098, back: .048 },
    { y: -.170, w: .105 + jaw, front: .129, back: .078 },
    { y: -.091, w: .145 + jaw * .6, front: .144, back: .114 },
    { y: -.017, w: .169 + cheek, front: .148, back: .139 },
    { y: .058, w: .170 + cheek * .6, front: .146, back: .145 },
    { y: .143, w: .156, front: .136, back: .143 },
    { y: .224, w: .105, front: .067, back: .100 },
  ];
  const columns = 10;
  k.add(head, k.layers(rows, columns), p.skin, [0, 0, 0]);
  const sample = (row: Layer, col: number): V => {
    const angle = col / columns * Math.PI * 2;
    const z = -Math.cos(angle);
    return [Math.sin(angle) * row.w, row.y, z * (z < 0 ? row.front : row.back)];
  };
  // Intersección del punto (x,y) con los mismos triángulos que forman el cráneo.
  function facialDepth(x: number, y: number) {
    const row = rows.findIndex(item => item.y >= y);
    if (row <= 0) return -.10;
    let nearest = Infinity;
    for (let col = 0; col < columns; col++) {
      const low = sample(rows[row - 1], col);
      const high = sample(rows[row], col);
      const highNext = sample(rows[row], col + 1);
      const lowNext = sample(rows[row - 1], col + 1);
      for (const [v0, v1, v2] of [[low, high, highNext], [low, highNext, lowNext]]) {
        const det = (v1[1] - v2[1]) * (v0[0] - v2[0]) + (v2[0] - v1[0]) * (v0[1] - v2[1]);
        if (Math.abs(det) < 1e-8) continue;
        const u = ((v1[1] - v2[1]) * (x - v2[0]) + (v2[0] - v1[0]) * (y - v2[1])) / det;
        const v = ((v2[1] - v0[1]) * (x - v2[0]) + (v0[0] - v2[0]) * (y - v2[1])) / det;
        const w = 1 - u - v;
        if (Math.min(u, v, w) >= -1e-5) nearest = Math.min(nearest, u * v0[2] + v * v1[2] + w * v2[2]);
      }
    }
    return Number.isFinite(nearest) ? nearest : -.056;
  }
  type XY = [number, number];
  function decal(coords: XY[], color: T.MeshStandardMaterial, lift = .005) {
    const area = coords.reduce((sum, [x, y], i) => {
      const [u, v] = coords[(i + 1) % coords.length];
      return sum + x * v - u * y;
    }, 0);
    const points = coords.map(([x, y]): V => [x, y, facialDepth(x, y) - lift]);
    const order = coords.map((_, i) => i);
    if (area > 0) order.reverse();
    k.add(head, k.mesh(points, [order]), color, [0, 0, 0]);
  }
  const lip = k.color(p.skin.color.clone().lerp(p.hair.color, .30));
  const iris = k.color(p.hair.color.clone().lerp(p.skin.color, .17));
  const brow = k.color(p.hair.color.clone().lerp(p.ink.color, .40));
  for (const side of [-1, 1]) {
    k.add(head, poly, p.skin, [side * .171, -.034, .001], [.027, .043, .026], [0, 0, side * .11]);
    const x = side * .076;
    const y = .026 + (a.cara === 4 ? .004 : a.cara === 1 ? -.003 : 0);
    const eyeW = .034 + eyes * .7;
    const eyeH = Math.max(.006, (.015 + eyes) * [1, .68, .64, .90, 1.30, .82, .76][a.cara]);
    const closed = a.cara === 3 && side > 0;
    if (closed) {
      decal([[x - eyeW, y], [x, y + .005], [x + eyeW, y], [x, y - .002]], p.ink);
    } else {
      decal([[x - eyeW, y], [x - eyeW * .51, y + eyeH * .78], [x + eyeW * .30, y + eyeH],
        [x + eyeW, y + .002], [x + eyeW * .42, y - eyeH * .77], [x - eyeW * .52, y - eyeH * .7]], p.white, .0058);
      const pupilX = x + (a.cara === 5 ? .005 : 0);
      const radius = Math.min(.014 + eyes * .5, eyeH * .93);
      const pupil = (r: number, lift: number, color: T.MeshStandardMaterial) => {
        const outline: XY[] = Array.from({ length: 6 }, (_, i) => {
          const t = -Math.PI / 6 - i * Math.PI / 3;
          return [pupilX + r * Math.cos(t), y + r * Math.sin(t)];
        });
        decal(outline, color, lift);
      };
      pupil(radius, .0083, iris);
      pupil(radius * .64, .010, p.ink);
      decal([[pupilX - .004, y + .003], [pupilX - .001, y + .003], [pupilX - .002, y + .006]], p.white, .011);
    }
    const upper = y + .039 + brows + (a.cara === 4 ? .016 : a.cara === 5 && side > 0 ? .009 : 0);
    const tilt = side * (a.cara === 6 ? -.013 : .004);
    decal([[x - .040, upper - tilt], [x - .030, upper + .010 - tilt], [x + .004, upper + .014],
      [x + .039, upper + tilt], [x + .006, upper + .005], [x - .022, upper + .003]], brow, .005);
  }
  const noseWidth = .027 + nose;
  const nosePoints: V[] = [
    [-.012, .031, facialDepth(-.012, .031) + .002], [.012, .031, facialDepth(.012, .031) + .002],
    [noseWidth, -.054, facialDepth(noseWidth, -.054) + .002],
    [0, -.045, -.184 - nose * .6], [-noseWidth, -.054, facialDepth(-noseWidth, -.054) + .002],
    [0, -.066, -.159 - nose * .3],
  ];
  k.add(head, k.mesh(nosePoints, [[0, 1, 3], [1, 2, 3], [0, 3, 4], [2, 5, 3], [3, 5, 4]]), p.skin, [0, 0, 0]);
  const mouthW = [.053, .061, .045, .050, .022, .052, .045][a.cara];
  const happy = [0, 1, 3, 5].includes(a.cara);
  const open = a.cara === 1 ? .020 : a.cara === 4 ? .022 : .003;
  const mouthY = -.119;
  const columnsMouth = [-1, -.60, 0, .60, 1].map(u => {
    const x = u * mouthW, swell = 1 - u * u;
    const y = mouthY + u * u * (happy ? .010 : -.0025) + (a.cara === 5 ? u * .005 : 0);
    return [y + (.005 + lips) * swell, y, y - open * swell, y - (open + .006 + lips) * swell]
      .map((h): V => [x, h, facialDepth(x, h) - .007]);
  });
  for (const [upper, lower, color] of [[0, 1, lip], [1, 2, p.ink], [2, 3, lip]] as const) {
    const points = columnsMouth.flatMap(column => [column[upper], column[lower]]);
    const faces = columnsMouth.slice(1).map((_, i) => [i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1]);
    k.add(head, k.mesh(points, faces), color, [0, 0, 0]);
  }
  if (a.detalle === 1) for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = side * (.055 + i * .015), y = -.034 - i % 2 * .009;
    decal([[x - .002, y], [x + .001, y + .0024], [x + .002, y - .0017]], iris);
  }
  if (a.detalle === 2 || a.detalle === 3) {
    decal([[-.057, -.104], [-.027, -.084], [0, -.088], [.027, -.084], [.057, -.104],
      [.030, -.102], [0, -.101], [-.030, -.102]], p.hair, .0067);
  }
  if (a.detalle === 3 || a.detalle === 4) {
    const length = a.detalle === 3 ? -.203 : -.186;
    decal([[-.090, -.151], [-.045, -.157], [0, -.163], [.045, -.157], [.090, -.151],
      [.058, length + .006], [0, length], [-.058, length + .006]], p.hair, .0058);
  }
  if (a.detalle === 5) decal([[.108, -.073], [.114, -.073], [.114, -.079], [.108, -.079]], p.ink);
  if (a.detalle === 6) decal([[.087, -.077], [.115, -.062], [.123, -.073], [.094, -.089]], p.white, .007);
}

function addHair(k: Kit, head: T.Group, a: Avatar, p: Palette, fit: 'libre' | 'ajustado' | 'casco') {
  if (fit === 'casco') return;
  const tight = fit === 'ajustado';
  const style = a.pelo;
  const scalp: V[] = [];
  const faces: number[][] = [];
  const sides = 10;
  const maxY = tight ? .229 : style === 5 ? .233 : .251;
  for (let row = 0; row < 3; row++) for (let i = 0; i < sides; i++) {
    const theta = i / sides * Math.PI * 2;
    const front = Math.cos(theta);
    const hairline = .119 - (1 - front) * .096;
    const radius = [1, .818, .40][row];
    const y = [hairline, .177 + .012 * front, maxY][row];
    scalp.push([Math.sin(theta) * (tight ? .180 : .186) * radius, y, .010 - front * .178 * radius]);
    if (row) {
      const from = (row - 1) * sides + i, next = (row - 1) * sides + (i + 1) % sides;
      faces.push([from, from + sides, next + sides, next]);
    }
  }
  faces.push(Array.from({ length: sides }, (_, i) => 3 * sides - 1 - i));
  // Cerrá el borde interior con un centro oculto por el cráneo.
  const inner = scalp.push([0, .024, .010]) - 1;
  for (let i = 0; i < sides; i++) faces.push([inner, i, (i + 1) % sides]);
  k.add(head, k.mesh(scalp, faces), p.hair, [0, 0, 0]);
  const lit = k.shade(p.hair, .027), shadow = k.shade(p.hair, -.025);
  const lock = (pos: V, size: V, rot: V, i: number) => k.add(head, poly,
    i % 5 === 2 ? lit : i % 4 === 3 ? shadow : p.hair, pos, size, rot);
  if (style === 5) return;

  if (style === 3 || style === 6) {
    const puff = style === 6 ? 1.20 : 1;
    // Una hilera baja abraza la nuca y sienes; los bloques de arriba forman el copete.
    for (let i = 0; i < 6; i++) {
      const angle = .96 + i * (Math.PI * 2 - 1.92) / 5;
      // Despejá las orejas: las copas y los aros tienen su propio volumen lateral.
      if ((a.acc === 1 || a.acc === 2) && (i < 2 || i > 3)) continue;
      const x = Math.sin(angle) * (tight ? .149 : .161) * (tight ? 1 : puff);
      const z = .028 - Math.cos(angle) * (tight ? .138 : .144) * puff;
      const y = .009 + .027 * Math.cos(angle) + .012 * Math.sin(i * 2.2);
      lock([x, y, z], [tight ? .051 : .073, (.101 + .014 * Math.sin(i * 2)) * puff, .070],
        [.35 * Math.sin(i), angle, -.25 * Math.cos(angle)], i);
    }
    if (!tight) {
      lock([-.136, .144, -.069], [.094 * puff, .084 * puff, .086], [.26, .43, -.31], 6);
      lock([.146, .157, -.047], [.082 * puff, .095 * puff, .090], [.33, .69, .42], 7);
      lock([-.072, .206, -.107], [.108 * puff, .089 * puff, .108], [.51, .17, -.46], 8);
      lock([.048, .233, -.088], [.102 * puff, .094 * puff, .107], [.25, .77, .59], 9);
      lock([0, .198, .102], [.131 * puff, .098 * puff, .092], [.4, .5, -.37], 10);
    }
    return;
  }

  // Las piezas ceñidas mantienen la silueta lateral visible bajo un gorro.
  const crownY = tight ? .170 : .201;
  if (!tight) lock([-.038, crownY, -.090], [.143, .071, .097], [.33, .18, -.27], 0);
  switch (style) {
    case 0: // Corto con raya.
      if (!tight) lock([.111, .152, -.049], [.078, .066, .116], [0, .22, .23], 1);
      break;
    case 1: // Flequillo lateral.
      lock([.053, tight ? .131 : .151, -.127], [.119, .052, .047], [.08, -.25, .32], 1);
      break;
    case 2:
    case 8: { // Largo y melena: caída continua alrededor de la nuca.
      const full = style === 2;
      const earsClear = a.acc === 1 || a.acc === 2;
      for (const side of [-1, 1]) lock([side * (tight ? .148 : .167), full ? -.118 : -.066, earsClear ? .122 : .029],
        [tight ? .044 : .065, full ? .224 : .157, earsClear ? .063 : .099], [-.03, .17 * side, -.08 * side], side + 3);
      lock([0, full ? -.133 : -.078, .135], [tight ? .148 : .172, full ? .193 : .143, .063], [.09, 0, 0], 5);
      break;
    }
    case 4: // Rodete reubicado hacia la nuca bajo accesorios.
      lock([0, tight ? -.014 : .245, tight ? .163 : .110], [.083, .084, .081], [.07, .40, .12], 4);
      break;
    case 7: // Coleta.
      lock([.024, -.069, .164], [.074, .152, .073], [-.26, .05, .09], 5);
      lock([.028, -.215, .218], [.060, .105, .054], [-.32, 0, .11], 6);
      break;
    case 9: // Cresta baja bajo el gorro.
      for (let i = 0; i < (tight ? 2 : 4); i++) lock([0, tight ? .133 - i * .064 : .259 - i * .012,
        tight ? .149 + i * .025 : -.082 + i * .064], [.048, tight ? .057 : .086 - i * .009, .065],
        [.36, 0, 0], i + 2);
      break;
  }
}


// Biseles y monturas se trazan en sentido horario desde el frente (-Z).
function gearRim(k: Kit, outer: V[], inner: V[], thickness: number, closed = true) {
  const count = outer.length;
  const back = (points: V[]) => points.map(([x, y, z]): V => [x, y, z + thickness]);
  const faces: number[][] = [];
  for (let i = 0; i < count - (closed ? 0 : 1); i++) {
    const j = (i + 1) % count;
    faces.push([i, j, j + count, i + count],
      [j + 2 * count, i + 2 * count, i + 3 * count, j + 3 * count],
      [j, i, i + 2 * count, j + 2 * count],
      [i + count, j + count, j + 3 * count, i + 3 * count]);
  }
  if (!closed) faces.push([0, count, 3 * count, 2 * count],
    [count - 1, 3 * count - 1, 4 * count - 1, 2 * count - 1]);
  return k.mesh([...outer, ...inner, ...back(outer), ...back(inner)], faces);
}

function gearArc(k: Kit, x: number, y: number, originY: number, z: number, width: number) {
  const arch = (inset: number) => Array.from({ length: 9 }, (_, i): V => {
    const angle = Math.PI * (1 - i / 8);
    return [Math.cos(angle) * (x - inset), originY + Math.sin(angle) * (y - inset), z];
  });
  return gearRim(k, arch(0), arch(width), .032, false);
}

function gearStar(k: Kit, scale: number) {
  const points: V[] = [[0, 0, 0]];
  const faces: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 - i * Math.PI / 5;
    const radius = (i % 2 ? .47 : 1) * scale;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
    faces.push([0, i + 1, (i + 1) % 10 + 1]);
  }
  return k.mesh(points, faces);
}

// El contorno de apertura coincide con el del visor insertado.
const helmetWindow = [[-.164, .167], [.164, .167], [.198, .116], [.193, -.143],
  [.125, -.223], [-.125, -.223], [-.193, -.143], [-.198, .116]];

function addHeadwear(k: Kit, head: T.Group, a: Avatar, p: Palette) {
  const attach = (geometry: T.BufferGeometry, material = p.hat, position: V = [0, 0, 0],
    scale?: V, rotation?: V) => k.add(head, geometry, material, position, scale, rotation);
  switch (a.gorro) {
    case 1: { // Vincha a la altura de la frente, con puntas hacia la nuca.
      const band = gearArc(k, .212, .172, 0, -.021, .015);
      attach(band, p.hat, [0, .129, .011], [1, 1, 1], [-Math.PI / 2, 0, 0]);
      attach(block, p.cyan, [0, .146, -.17], [.066, .014, .009]);
      break;
    }
    case 2: { // Gorra: copa baja y visera cerrada de seis lados.
      attach(k.layers([
        { y: .129, w: .208, front: .173, back: .181 },
        { y: .209, w: .201, front: .163, back: .174 },
        { y: .269, w: .122, front: .104, back: .115 },
      ]));
      const top: V[] = [[-.15, .144, -.096], [.15, .144, -.096], [.166, .13, -.205],
        [.106, .119, -.264], [-.106, .119, -.264], [-.166, .13, -.205]];
      const bottom = top.map(([x, y, z]): V => [x, y - .014, z]);
      const faces = [[0, 1, 2, 3, 4, 5], [11, 10, 9, 8, 7, 6]];
      top.forEach((_, i) => { const j = (i + 1) % top.length; faces.push([j, i, i + 6, j + 6]); });
      attach(k.mesh([...top, ...bottom], faces));
      attach(block, p.cyan, [0, .198, -.167], [.057, .021, .010], [.25, 0, 0]);
      break;
    }
    case 3: { // Silueta de lana con superficies lisas.
      attach(k.layers([
        { y: .081, w: .205, front: .169, back: .178 },
        { y: .149, w: .212, front: .177, back: .187 },
        { y: .257, w: .176, front: .143, back: .157 },
        { y: .313, w: .076, front: .070, back: .078 },
      ]));
      attach(k.layers([
        { y: .092, w: .207, front: .173, back: .182 },
        { y: .137, w: .215, front: .181, back: .191 },
      ]), k.shade(p.hat, -.045));
      attach(poly, p.cyan, [0, .339, .003], [.047, .045, .045]);
      break;
    }
    case 4: { // Boina con caída lateral, asentada sobre la coronilla.
      attach(k.layers([
        { y: .163, w: .190, front: .154, back: .170 },
        { y: .202, w: .241, front: .187, back: .201 },
        { y: .254, w: .199, front: .152, back: .174 },
        { y: .275, w: .114, front: .090, back: .092 },
      ]), p.hat, [-.015, 0, .006], [1, 1, 1], [0, 0, .10]);
      attach(block, k.shade(p.hat, -.040), [-.039, .284, .009], [.020, .031, .020], [0, 0, .19]);
      break;
    }
    case 5: { // Galera con ala baja y cinta propia.
      attach(tube, p.hat, [0, .189, .009], [.225, .026, .190]);
      attach(k.layers([
        { y: .195, w: .169, front: .146, back: .154 },
        { y: .348, w: .186, front: .153, back: .164 },
      ]));
      attach(tube, p.cyan, [0, .219, .004], [.174, .029, .160]);
      break;
    }
    case 6: { // Casco continuo: deja la cara visible en la abertura biselada.
      const ring = (sx: number, sy: number, z: number, y = 0) =>
        helmetWindow.map(([x, h]): V => [x * sx, h * sy + y, z]);
      const rim = ring(1, 1, -.214);
      const crown = ring(1.23, 1.23, -.167, .006);
      const hull = ring(1.277, 1.355, .076, .014);
      const back = ring(.79, .94, .220, .015);
      const n = rim.length;
      const faces: number[][] = [];
      for (let row = 0; row < 3; row++) for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, start = row * n;
        faces.push([start + j, start + i, start + n + i, start + n + j]);
      }
      faces.push(Array.from({ length: n }, (_, i) => 4 * n - 1 - i));
      attach(k.mesh([...rim, ...crown, ...hull, ...back], faces));
      const opening = ring(.949, .951, -.217);
      attach(gearRim(k, rim.map(([x, y]): V => [x * 1.012, y * 1.012, -.218]), opening, .026), p.trim);
      for (const side of [-1, 1]) {
        attach(block, p.cyan, [side * .227, -.015, -.178], [.022, .072, .014], [0, side * -.42, 0]);
      }
      break;
    }
    case 7: { // Corona abierta. La altura de puntas sale de la misma banda.
      const ring = (inside: boolean, top: boolean) => Array.from({ length: 12 }, (_, i): V => {
        const theta = i * Math.PI / 6;
        const y = top ? (i % 2 ? .232 : .323) : .177;
        return [Math.sin(theta) * (inside ? .188 : .201), y, .009 - Math.cos(theta) * (inside ? .159 : .172)];
      });
      const faces: number[][] = [];
      for (let i = 0; i < 12; i++) {
        const j = (i + 1) % 12;
        faces.push([i, i + 12, j + 12, j], [i + 24, j + 24, j + 36, i + 36],
          [i + 12, i + 36, j + 36, j + 12], [i, j, j + 24, i + 24]);
      }
      attach(k.mesh([...ring(false, false), ...ring(false, true), ...ring(true, false), ...ring(true, true)], faces));
      attach(poly, p.cyan, [0, .219, -.168], [.026, .030, .014]);
      break;
    }
  }
}

function addEyewear(k: Kit, head: T.Group, a: Avatar, p: Palette) {
  if (!a.lentes) return;
  if (a.lentes === 10) {
    const tint = k.color(p.cyan.color.clone().lerp(p.glasses.color, .52));
    if (a.gorro === 6) {
      const lens = helmetWindow.map(([x, y]): V => [x * .98, y * .98, -.211]);
      k.visorMesh(head, k.mesh(lens, [lens.map((_, i) => i)]), tint);
      return;
    }
    const outside: V[] = [[-.175, .091, -.161], [-.123, .107, -.189], [.123, .107, -.189], [.175, .091, -.161],
      [.170, -.043, -.164], [.099, -.066, -.198], [.036, -.052, -.202], [0, -.027, -.209],
      [-.036, -.052, -.202], [-.099, -.066, -.198], [-.170, -.043, -.164]];
    const inside = outside.map(([x, y, z]): V => [x * .90, .022 + (y - .022) * .83, z + .003]);
    k.add(head, gearRim(k, outside, inside, .017), p.glasses, [0, 0, 0]);
    const glass = inside.map(([x, y, z]): V => [x * 1.017, .022 + (y - .022) * 1.022, z + .004]);
    // El centro subdivide las facetas del visor y sigue el hueco sobre la nariz.
    k.visorMesh(head, k.mesh([...glass, [0, .029, -.204]],
      glass.map((_, i) => [glass.length, i, (i + 1) % glass.length])), tint);
    for (const side of [-1, 1]) k.link(head, p.glasses, [side * .172, .023, -.159],
      [side * .185, .023, .015], .014, .015);
    return;
  }

  const id = a.lentes;
  const rectangular = [2, 5, 8].includes(id);
  const closed = id !== 5;
  const count = rectangular ? (closed ? 4 : 5) : id === 7 ? 6 : 10;
  const width = id === 3 ? .064 : id === 8 ? .053 : .060;
  const height = id === 3 ? .063 : id === 2 ? .039 : id === 8 ? .032 : id === 9 ? .047 : .052;
  const y = id === 8 ? .011 : .025;
  const bridgeX = .079 - width;
  for (const side of [-1, 1]) {
    const outline = (rx: number, ry: number) => Array.from({ length: count }, (_, i): V => {
      const theta = closed ? (rectangular ? Math.PI * (1 - Math.SQRT2 / 6) : Math.PI / 2) - i * 2 * Math.PI / count
        : Math.PI - i * Math.PI / (count - 1);
      const c = Math.cos(theta), s = Math.sin(theta);
      const dx = (rectangular && closed ? Math.sign(c) : c) * rx;
      const dy = (rectangular && closed ? Math.sign(s) : s) * ry;
      const x = side * .079 + dx;
      const shape = id === 4 ? side * dx * .24 : id === 6 ? (1 - Math.abs(c)) * Math.min(0, s) * .012 : 0;
      return [x, y + dy + shape, -.159 + (Math.abs(x) - .079) * .26];
    });
    const outer = outline(width, height), inner = outline(width - .006, height - .007);
    k.add(head, gearRim(k, outer, inner, .007, closed), p.glasses, [0, 0, 0]);
    k.link(head, p.glasses, [side * (.078 + width), y + .012, -.159 + width * .26],
      [side * .182, y - .005, .022], .008, .009);
    if (id === 9) {
      const lens = inner.map(([x, h, z]): V => [x, h, z + .003]);
      k.add(head, k.mesh(lens, [lens.map((_, i) => i)]), k.shade(p.glasses, -.097), [0, 0, 0]);
    }
  }
  const bridgeY = y + (closed ? .015 : .023);
  const seat: V = [0, Math.min(.030, bridgeY), -.153];
  for (const side of [-1, 1]) {
    k.link(head, p.glasses, [side * (bridgeX + .008), bridgeY, -.171], seat, .008, .012);
  }
}

function addAccessory(k: Kit, head: T.Group, torso: T.Group, a: Avatar, p: Palette) {
  switch (a.acc) {
    case 1: { // Los aros se enganchan en el borde anterior de las orejas.
      for (const side of [-1, 1]) {
        const x = side * .190, y = -.079, z = -.045;
        const diamond = (rx: number, ry: number): V[] => [[x, y + ry, z], [x + rx, y, z],
          [x, y - ry, z], [x - rx, y, z]];
        k.link(head, p.accessory, [side * .181, -.049, -.020], [x, y + .031, z], .009, .010);
        k.add(head, gearRim(k, diamond(.022, .039), diamond(.014, .028), .008), p.accessory, [0, 0, 0]);
      }
      break;
    }
    case 2: { // Carcasas ancladas y micrófono a un costado de la sonrisa.
      if (a.gorro === 0) {
        const arch = gearArc(k, .220, .325, -.007, .019, .017);
        k.add(head, arch, p.trim, [0, 0, 0]);
      }
      for (const side of [-1, 1]) {
        k.add(head, tube, p.trim, [side * .209, -.012, .005], [.065, .051, .058], [0, 0, Math.PI / 2]);
        k.add(head, block, k.shade(p.accessory, -.11), [side * .236, -.008, .004], [.013, .075, .068]);
        k.add(head, block, p.cyan, [side * .244, -.008, -.013], [.008, .050, .014]);
      }
      k.link(head, p.trim, [-.218, -.044, -.039], [-.208, -.082, -.127], .017, .017);
      k.link(head, p.trim, [-.208, -.082, -.127], [-.113, -.096, -.203], .017, .017);
      k.add(head, block, p.ink, [-.106, -.097, -.209], [.035, .017, .021], [0, -.23, 0]);
      break;
    }
    case 3: {
      for (const side of [-1, 1]) k.add(torso, poly, p.accessory, [side * .049, .394, -.116],
        [.062, .045, .022], [0, 0, side * .24]);
      k.add(torso, block, p.mint, [0, .394, -.137], [.034, .034, .022]);
      break;
    }
    case 4: { // La bufanda queda por debajo de la mandíbula y el casco.
      const y = a.gorro === 6 ? .366 : .413;
      k.add(torso, k.layers([
        { y: y - .023, w: .136, front: .099, back: .096 },
        { y: y + .020, w: .124, front: .100, back: .090 },
      ]), p.accessory, [0, 0, 0]);
      for (const side of [-1, 1]) {
        const endY = side > 0 ? .208 : .167;
        k.link(torso, p.accessory, [side * .059, y - .012, -.095], [side * .080, endY, -.166], .046, .014);
        k.add(torso, block, p.cyan, [side * .078, endY + .029, -.172], [.046, .015, .008]);
      }
      break;
    }
    case 5: {
      for (const side of [-1, 1]) k.link(torso, p.accessory, [side * .084, .407, -.089],
        [0, .251, -.163], .016, .008);
      k.add(torso, tube, p.gold, [0, .214, -.172], [.047, .015, .046], [Math.PI / 2, 0, 0]);
      k.add(torso, gearStar(k, .029), p.mint, [0, .214, -.181]);
      break;
    }
    case 6: {
      k.add(head, gearArc(k, .196, .256, .006, .004, .016), p.trim, [0, 0, 0]);
      for (const side of [-1, 1]) {
        k.link(head, p.accessory, [side * .112, .218, .020], [side * .155, .360, .020], .014);
        k.add(head, poly, p.cyan, [side * .158, .377, .020], [.031, .032, .033]);
      }
      break;
    }
    case 7:
      k.add(torso, gearStar(k, .048), p.gold, [-.091, .266, -.154], [1, 1, 1], [0, .19, 0]);
      k.add(torso, gearStar(k, .035), p.accessory, [-.091, .266, -.156], [1, 1, 1], [0, .19, 0]);
      break;
  }
}


function outfit(k: Kit, body: T.Group, a: Avatar, p: Palette) {
  const armor = a.ropa === 5;
  const chest = armor ? .276 : a.ropa === 1 ? .271 : .253;
  k.add(body, k.layers([
    { y: -.116, w: .203, front: .103, back: .101 },
    { y: .038, w: a.ropa === 1 ? .204 : .181, front: .113, back: .105 },
    { y: .233, w: .222, front: .145, back: .114 },
    { y: .341, w: chest, front: .116, back: .102 },
    { y: .424, w: .097, front: .070, back: .070 },
  ]), p.suit, [0, 0, 0]);
  k.add(body, k.layers([
    { y: .393, w: .066, front: .065, back: .061 },
    { y: .514, w: .064, front: .061, back: .062 },
  ], 6), p.skin, [0, 0, -.018]);

  const trim = k.color(p.trim.color.clone().lerp(p.ink.color, .20));
  const zipper = k.color(p.white.color.clone().lerp(p.trim.color, .64));
  // El cuello alto se pliega lo suficiente para dejar lugar al casco.
  const high = a.gorro === 6 ? .419 : a.ropa >= 4 ? .478 : .440;
  const neck = k.layers([
    { y: .400, w: .115, front: .086, back: .082 },
    { y: high, w: .093, front: .081, back: .076 },
  ], 6);
  k.add(body, neck, trim, [0, 0, 0]);
  const collarTip = a.gorro === 6 ? .417 : high;
  k.link(body, p.mint, [.046, .410, -.086], [.055, collarTip, -.079], .012, .007);
  const seam: V[] = [[-.0055, .008, -.113], [.0055, .008, -.113],
    [-.0055, .233, -.150], [.0055, .233, -.150],
    [-.0055, .383, -.098], [.0055, .383, -.098]];
  k.add(body, k.mesh(seam, [[0, 2, 3, 1], [2, 4, 5, 3]]), zipper, [0, 0, 0]);
  k.add(body, block, p.mint, [-.104, .277, -.112], [.095, .019, .008], [0, -.29, .01]);

  if (a.ropa === 1) {
    k.add(body, block, trim, [0, .082, -.123], [.174, .050, .016]);
  } else if (a.ropa === 2) {
    for (const side of [-1, 1]) {
      const lapel: V[] = [[side * .016, .375, -.107], [side * .097, .418, -.075], [side * .085, .340, -.104]];
      k.add(body, k.mesh(lapel, [side > 0 ? [0, 1, 2] : [0, 2, 1]]), p.mint, [0, 0, 0]);
    }
  } else if (a.ropa === 3) {
    k.add(body, block, p.cyan, [.100, .265, -.117], [.050, .015, .005], [0, .29, 0]);
  } else if (a.ropa === 4) {
    k.add(body, block, trim, [.094, .117, -.120], [.065, .029, .007], [0, .38, 0]);
  } else if (armor) {
    k.add(body, k.layers([
      { y: .136, w: .065, front: .170, back: .035 },
      { y: .203, w: .065, front: .180, back: .035 },
    ], 6), trim, [0, 0, 0]);
    k.add(body, block, p.cyan, [0, .179, -.181], [.061, .014, .007]);
  }
}

function arm(k: Kit, a: Avatar, p: Palette, seated: boolean, side: number) {
  const group = new T.Group();
  const short = a.ropa === 0 || a.ropa === 3;
  const sleeveEnd = short ? -.114 : -.277;
  k.add(group, k.layers([
    { y: .028, w: .052, front: .053, back: .049 },
    { y: -.036, w: .072, front: .069, back: .062 },
    { y: sleeveEnd, w: short ? .055 : .045, front: .047, back: .042 },
  ], 6), p.suit, [0, 0, 0]);
  if (short) k.add(group, k.layers([
    { y: -.110, w: .050, front: .043, back: .039 },
    { y: -.283, w: .044, front: .045, back: .041 },
  ], 5), p.skin, [0, 0, 0]);

  const lower = new T.Group();
  lower.position.y = -.266;
  lower.rotation.x = seated ? .84 : .035;
  group.add(lower);
  k.add(lower, k.layers([
    { y: .010, w: .044, front: .048, back: .043 },
    { y: -.061, w: .049, front: .050, back: .043 },
    { y: -.212, w: .034, front: .033, back: .034 },
  ], 5), short ? p.skin : p.suit, [0, 0, 0]);
  k.add(lower, poly, p.skin, [0, -.236, -.006], [.036, .056, .026]);

  if (side === -1 || a.ropa === 5) {
    const pad = k.layers([
      { y: -.061, w: .077, front: .073, back: .067 },
      { y: -.019, w: .081, front: .076, back: .069 },
      { y: .040, w: .057, front: .058, back: .050 },
    ], 6);
    k.add(group, pad, side === -1 ? p.cyan : p.trim, [side * .013, .013, 0]);
  }
  return group;
}

function legs(k: Kit, p: Palette, seated: boolean) {
  const group = new T.Group();
  const trousers = k.shade(p.suit, -.012);
  k.add(group, k.layers([
    { y: -.041, w: .185, front: .075, back: .094 },
    { y: .130, w: .181, front: .087, back: .088 },
  ]), trousers, [0, 0, 0]);

  const shin = k.layers([
    { y: seated ? -.393 : -.710, w: .042, front: .046, back: .044 },
    { y: seated ? -.194 : -.363, w: .057, front: .057, back: .051 },
    { y: seated ? .005 : .073, w: seated ? .070 : .095, front: seated ? .070 : .093, back: .073 },
  ], 6);
  const thigh = seated ? k.layers([
    { y: -.293, w: .076, front: .064, back: .066 },
    { y: -.032, w: .096, front: .084, back: .088 },
  ], 6) : undefined;
  for (const side of [-1, 1]) {
    const x = side * .103, z = seated ? -.258 : 0;
    if (thigh) k.add(group, thigh, trousers, [x, .018, .048], [1, 1, 1], [Math.PI / 2, 0, 0]);
    k.add(group, shin, trousers, [x, 0, z]);
    k.add(group, block, p.trim, [x, seated ? -.404 : -.734, z - .028], [.10, .074, .163], [0, side * .065, 0]);
  }
  return group;
}

export interface PilotOptions { seated?: boolean; closeup?: boolean }

function parts(k: Kit, a: Avatar, seated: boolean) {
  const head = new T.Group(), hair = new T.Group(), hat = new T.Group();
  const eyewear = new T.Group(), earGear = new T.Group(), chestGear = new T.Group();
  const p = palette(k, a);
  const torso = new T.Group(), lower = legs(k, p, seated);
  const arms = [-1, 1].map(side => arm(k, a, p, seated, side));
  outfit(k, torso, a, p);
  const helmet = a.gorro === 6;
  const facialDetail = a.acc === 4 && a.detalle >= 3 && a.detalle <= 4 ? a.detalle === 3 ? 2 : 0 : a.detalle;
  addFace(k, head, { ...a, detalle: facialDetail }, p);
  addHair(k, hair, a, p, helmet ? 'casco' : a.gorro ? 'ajustado' : 'libre');
  addHeadwear(k, hat, a, p);
  if (!helmet || a.lentes === 10) addEyewear(k, eyewear, a, p);
  const antennaBlocked = a.acc === 6 && a.gorro !== 0;
  const earpieceBlocked = helmet && (a.acc === 1 || a.acc === 2);
  if (!antennaBlocked && !earpieceBlocked) addAccessory(k, earGear, chestGear, a, p);
  return { head, hair, hat, eyewear, earGear, chestGear, torso, arms, lower };
}

function triangles(...groups: T.Object3D[]) {
  let count = 0;
  for (const group of groups) group.traverse(object => {
    if (object instanceof T.Mesh) count += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
  });
  return count;
}

/** Cuenta los triángulos visibles tras aplicar las reglas de equipamiento. */
export function inspectPilot(raw?: Avatar, { seated = true }: PilotOptions = {}) {
  const a = cleanAvatar(raw ?? REFERENCE_AVATAR), k = new Kit();
  try {
    const g = parts(k, a, seated);
    const counts = {
      cabeza: triangles(g.head),
      pelo: triangles(g.hair),
      uniforme: triangles(g.torso, g.lower, ...g.arms),
      gorro: triangles(g.hat),
      accesorio: triangles(g.earGear, g.chestGear),
      lentes: triangles(g.eyewear),
    };
    const total = Object.values(counts).reduce((sum, amount) => sum + amount, 0);
    return { ...counts, total, materiales: a.lentes === 10 ? 2 : 1 };
  } finally { k.done(); }
}

type Template = { head: T.Group; torso: T.Group; legs: T.Group; arms: T.Group[] };
const templates = new Map<string, Template>();

function template(a: Avatar, seated: boolean): Template {
  // El campo antiguo style no interviene en este modelo ni duplica la caché.
  const { style: _style, ...appearance } = a as Avatar & { style?: unknown };
  const key = JSON.stringify([seated, appearance]);
  const cached = templates.get(key);
  if (cached) {
    templates.delete(key);
    templates.set(key, cached);
    return cached;
  }
  const k = new Kit();
  try {
    const g = parts(k, a, seated);
    g.head.add(g.hair, g.hat, g.eyewear, g.earGear);
    g.torso.add(g.chestGear);
    const result = {
      head: k.combine(g.head), torso: k.combine(g.torso),
      legs: k.combine(g.lower), arms: g.arms.map(arm => k.combine(arm)),
    };
    templates.set(key, result);
    if (templates.size > 24) {
      const oldest = templates.keys().next().value!;
      const evicted = templates.get(oldest)!;
      // Estas mallas de plantilla nunca se dibujan. Conservá los dos materiales
      // base para nuevas instancias y liberá solo las geometrías expulsadas.
      for (const group of [evicted.head, evicted.torso, evicted.legs, ...evicted.arms]) {
        group.traverse(part => { if (part instanceof T.Mesh) part.geometry.dispose(); });
      }
      templates.delete(oldest);
    }
    return result;
  } finally { k.done(); }
}

export function makePilot(seat: number, raw?: Avatar, { seated = true }: PilotOptions = {}) {
  const a = cleanAvatar(raw ?? REFERENCE_AVATAR);
  const source = template(a, seated);
  const owned = new Map<T.Material, T.Material>();
  const instantiate = (group: T.Group) => {
    const result = group.clone();
    result.traverse(part => {
      if (!(part instanceof T.Mesh)) return;
      const original = part.material as T.Material;
      const material = owned.get(original) ?? original.clone();
      owned.set(original, material);
      part.material = material;
      part.userData.avatarFacetado = true;
      // release() puede liberar esta instancia sin invalidar las otras vistas.
      part.geometry = part.geometry.clone();
    });
    return result;
  };
  const object = new T.Group();
  const torso = instantiate(source.torso), head = instantiate(source.head);
  const arms = source.arms.map(instantiate);
  head.position.set(0, .686, -.031);
  torso.position.y = .22;
  torso.add(head);
  arms.forEach((arm, i) => {
    arm.position.set((i * 2 - 1) * .253, .336, 0);
    torso.add(arm);
  });
  object.add(torso, instantiate(source.legs));
  const [x, y, z] = crewSeats[seat] ?? crewSeats[0];
  object.position.set(x, y, z);
  const direction = seat % 2 ? 1 : -1;
  object.rotation.y = direction * .65;
  return {
    object,
    pose(seconds: number, action: number, reduced: boolean, kind?: CabinEffect['kind']) {
      const amount = Math.sin(Math.PI * T.MathUtils.clamp(action, 0, 1));
      const reach = kind === 'ok' ? amount : 0, recoil = kind === 'error' ? amount : 0;
      const signal = kind === 'help' ? amount : 0, cheer = kind === 'celebrate' ? amount : 0;
      torso.rotation.x = (seated ? -.10 : -.015) - reach * .14 + recoil * .43 - cheer * .07;
      torso.rotation.z = (reduced ? 0 : Math.sin(seconds * 1.4 + seat) * .019) + direction * signal * .22;
      head.rotation.set(reach * .19 - recoil * .31 - cheer * .12,
        direction * ((seated ? .25 : .12) + reach * .23 + signal * .35), 0);
      const rest = seated ? .25 : .025;
      arms[0].rotation.set(rest + recoil * .57 + cheer * 2.54, 0, -.068 - signal * 1.35 - cheer * .35);
      arms[1].rotation.set(rest + reach * 1.25 + recoil * .47 + cheer * 2.44, 0, .068 + reach * .2 + cheer * .39);
    },
  };
}
