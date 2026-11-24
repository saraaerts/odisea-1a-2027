/**
 * Odisea · personaje 05. Modelo procedural inspirado en la lámina de referencia.
 * Copiá el archivo final avatar.ts a src/render/avatar.ts en el proyecto Odisea.
 * Three.js 0.170.0. Sin texturas, descargas externas ni modelos por la red.
 * makePilot() conserva la API del juego; seated:false permite revisar el cuerpo.
 */
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AVATAR_OPTIONS, cleanAvatar, type Avatar } from '../config.ts';
import type { CabinEffect } from './cabin.ts';

type V = [number, number, number];
// Ajustes finos opcionales. El vestuario de Odisea todavía no los guarda, así que hoy no vienen.
type Custom = Partial<Record<'skin' | 'hair' | 'suit' | 'hat' | 'glasses' | 'accessory', string> &
  Record<'jaw' | 'cheek' | 'eyes' | 'brows' | 'nose' | 'lips', number>>;
const custom = (a: Avatar) => (a as Avatar & { custom?: Custom }).custom;
type Layer = { y: number; w: number; front: number; back: number };
type Palette = Record<'skin' | 'hair' | 'suit' | 'trim' | 'cyan' | 'mint' | 'hat' |
  'glasses' | 'accessory' | 'ink' | 'white' | 'gold', T.MeshStandardMaterial>;

export const REFERENCE_AVATAR = cleanAvatar({
  pelo: 3, colorPelo: 1, piel: 2, cara: 0, detalle: 0, ropa: 4, colorRopa: 3,
  gorro: 0, colorGorro: 3, acc: 2, colorAcc: 1, lentes: 1, colorLentes: 0,
  custom: { skin: '#BF865E', hair: '#30201E', suit: '#202C50',
    accessory: '#49E3E7', glasses: '#292B34' },
});

export const crewSeats = [
  [-1.75, -.42, -1.05], [1.75, -.42, -1.05],
  [-2.54, -.4, 2.08], [2.54, -.4, 2.08],
] as const;

// Primitivas compartidas: se copian al combinar, nunca se liberan con un avatar.
const block = new T.BoxGeometry(1, 1, 1);
const poly = new T.IcosahedronGeometry(1, 0);
const round = new T.SphereGeometry(1, 10, 6);
const ring = new T.TorusGeometry(1, .10, 4, 12);
const band = new T.TorusGeometry(1, .18, 4, 12);
const tube = new T.CylinderGeometry(1, 1, 1, 10);

function material(color: T.ColorRepresentation) {
  return new T.MeshStandardMaterial({ color, flatShading: true, roughness: 1, metalness: 0 });
}

class Kit {
  private geometries = new Set<T.BufferGeometry>();
  private materials = new Set<T.MeshStandardMaterial>();
  readonly finish = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: T.DoubleSide });

  color(color: T.ColorRepresentation) {
    const result = material(color);
    this.materials.add(result);
    return result;
  }
  shade(base: T.MeshStandardMaterial, lightness: number) {
    return this.color(base.color.clone().offsetHSL(0, 0, lightness));
  }
  geo(geometry: T.BufferGeometry) {
    this.geometries.add(geometry);
    return geometry;
  }
  add(parent: T.Object3D, geometry: T.BufferGeometry, color: T.Material,
    position: V, scale: V = [1, 1, 1], rotation: V = [0, 0, 0]) {
    const part = new T.Mesh(geometry, color);
    part.position.set(...position);
    part.scale.set(...scale);
    part.rotation.set(...rotation);
    parent.add(part);
    return part;
  }
  mesh(points: V[], faces: number[][]) {
    const vertices: number[] = [];
    for (const face of faces) for (let i = 1; i + 1 < face.length; i++) {
      for (const index of [face[0], face[i], face[i + 1]]) vertices.push(...points[index]);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
    geometry.computeVertexNormals();
    return this.geo(geometry);
  }
  link(parent: T.Object3D, color: T.Material, from: V, to: V, width: number, depth = width) {
    const start = new T.Vector3(...from), end = new T.Vector3(...to);
    const direction = end.clone().sub(start);
    const part = this.add(parent, block, color, start.addScaledVector(direction, .5).toArray() as V,
      [width, direction.length(), depth]);
    part.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
    return part;
  }
  layers(rows: Layer[], count = 8) {
    const points: V[] = [], faces: number[][] = [];
    rows.forEach((row, y) => {
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        const z = -Math.cos(angle);
        points.push([Math.sin(angle) * row.w, row.y, z * (z < 0 ? row.front : row.back)]);
        if (y) {
          const a = (y - 1) * count + i, b = (y - 1) * count + (i + 1) % count;
          faces.push([a, a + count, b + count, b]);
        }
      }
    });
    faces.push(Array.from({ length: count }, (_, i) => i));
    faces.push(Array.from({ length: count }, (_, i) => points.length - 1 - i));
    return this.mesh(points, faces);
  }
  combine(source: T.Group) {
    source.updateMatrixWorld(true);
    const parts: T.BufferGeometry[] = [];
    source.traverse(part => {
      if (!(part instanceof T.Mesh) || !(part.material instanceof T.MeshStandardMaterial)) return;
      const cloned = part.geometry.clone();
      const geometry = cloned.index ? cloned.toNonIndexed() : cloned;
      if (geometry !== cloned) cloned.dispose();
      geometry.applyMatrix4(part.matrixWorld);
      const length = geometry.getAttribute('position').count;
      const colors = new Float32Array(length * 3);
      for (let i = 0; i < length; i++) part.material.color.toArray(colors, i * 3);
      geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      if (!geometry.hasAttribute('uv')) geometry.setAttribute('uv', new T.BufferAttribute(new Float32Array(length * 2), 2));
      parts.push(geometry);
    });
    const result = new T.Group();
    if (parts.length) {
      const geometry = mergeGeometries(parts);
      if (!geometry) throw new Error('No se pudieron combinar las piezas del avatar.');
      const mesh = new T.Mesh(geometry, this.finish);
      mesh.castShadow = mesh.receiveShadow = true;
      result.add(mesh);
    }
    parts.forEach(part => part.dispose());
    return result;
  }
  done() {
    this.geometries.forEach(part => part.dispose());
    this.materials.forEach(part => part.dispose());
    this.geometries.clear();
    this.materials.clear();
  }
}

function palette(k: Kit, a: Avatar): Palette {
  const tint = (field: keyof Custom, options: keyof typeof AVATAR_OPTIONS) =>
    custom(a)?.[field] as string | undefined ?? AVATAR_OPTIONS[options][a[options]];
  return {
    skin: k.color(tint('skin', 'piel')), hair: k.color(tint('hair', 'colorPelo')),
    suit: k.color(tint('suit', 'colorRopa')), hat: k.color(tint('hat', 'colorGorro')),
    glasses: k.color(tint('glasses', 'colorLentes')), accessory: k.color(tint('accessory', 'colorAcc')),
    trim: k.color('#152238'), cyan: k.color('#49D5E6'), mint: k.color('#9DDCC4'),
    ink: k.color('#241B1A'), white: k.color('#E2D5C3'), gold: k.color('#E1AE3C'),
  };
}

function addFace(k: Kit, head: T.Group, a: Avatar, p: Palette) {
  const jaw = (custom(a)?.jaw ?? 0) / 2, cheek = (custom(a)?.cheek ?? 0) / 2;
  const eyes = (custom(a)?.eyes ?? 0) / 2, brows = (custom(a)?.brows ?? 0) / 2;
  const nose = (custom(a)?.nose ?? 0) / 2, lips = (custom(a)?.lips ?? 0) / 2;
  const rows: Layer[] = [
    { y: -.211, w: .058 + jaw * .012, front: .105, back: .050 },
    { y: -.181, w: .092 + jaw * .023, front: .133, back: .073 },
    { y: -.112, w: .132 + jaw * .018, front: .148, back: .106 },
    { y: -.034, w: .165 + cheek * .013, front: .149, back: .135 },
    { y: .047, w: .171 + cheek * .009, front: .150, back: .148 },
    { y: .129, w: .163, front: .144, back: .151 },
    { y: .196, w: .139, front: .112, back: .133 },
    { y: .229, w: .092, front: .067, back: .080 },
  ];
  k.add(head, k.layers(rows, 12), p.skin, [0, 0, 0]);
  const skinShade = k.shade(p.skin, -.06), lip = k.color(p.skin.color.clone().lerp(new T.Color('#873F31'), .55));
  const iris = k.color('#65402B');
  // Proyección sobre la misma superficie poligonal del rostro para evitar ojos flotantes.
  const depth = (x: number, y: number) => {
    const index = Math.max(1, rows.findIndex(row => row.y >= y));
    const low = rows[index - 1], high = rows[index];
    const fraction = T.MathUtils.clamp((y - low.y) / (high.y - low.y), 0, 1);
    const w = T.MathUtils.lerp(low.w, high.w, fraction);
    const f = T.MathUtils.lerp(low.front, high.front, fraction);
    const sample = Math.asin(T.MathUtils.clamp(Math.abs(x) / w, 0, 1)) / (Math.PI / 6);
    const segment = Math.min(2, Math.floor(sample));
    const leftX = Math.sin(segment * Math.PI / 6), rightX = Math.sin((segment + 1) * Math.PI / 6);
    const along = (Math.min(1, Math.abs(x) / w) - leftX) / (rightX - leftX);
    return -T.MathUtils.lerp(Math.cos(segment * Math.PI / 6), Math.cos((segment + 1) * Math.PI / 6), along) * f;
  };
  const patch = (coords: [number, number][], color: T.MeshStandardMaterial, lift = .004) =>
    k.add(head, k.mesh(coords.map(([x, y]) => [x, y, depth(x, y) - lift]),
      [coords.map((_, i) => i)]), color, [0, 0, 0]);
  for (const side of [-1, 1]) {
    k.add(head, poly, p.skin, [side * .174, -.023, .001], [.032, .056, .030]);
    const centerX = side * .077, centerY = .026;
    const open = a.cara === 3 && side > 0 ? 0 : a.cara === 2 ? .5 : a.cara === 4 ? 1.22 : a.cara === 6 ? .75 : 1;
    const width = .038 + eyes * .005, height = (.017 + eyes * .004) * open;
    const rim: [number, number][] = [
      [centerX - width, centerY], [centerX - width * .50, centerY + height * .85],
      [centerX + width * .25, centerY + height], [centerX + width, centerY + .002],
      [centerX + width * .48, centerY - height * .76], [centerX - width * .46, centerY - height * .74],
    ];
    if (open) {
      patch(rim, p.white, .006);
      patch([rim[0], rim[1], rim[2], rim[3], [rim[3][0], rim[3][1] + .003],
        [rim[2][0], rim[2][1] + .003], [rim[1][0], rim[1][1] + .003]], p.ink, .008);
      const z = depth(centerX, centerY);
      const eyeRadius = Math.min(.017, height * .85);
      k.add(head, round, iris, [centerX, centerY, z - .012], [eyeRadius * .9, eyeRadius, .005]);
      k.add(head, round, p.ink, [centerX, centerY + .001, z - .016], [eyeRadius * .48, eyeRadius * .71, .003]);
      k.add(head, poly, p.white, [centerX - .004, centerY + .006, z - .020], [.002, .002, .001]);
    } else patch([[centerX - width, centerY], [centerX, centerY + .004], [centerX + width, centerY],
      [centerX, centerY - .002]], p.ink, .008);
    const browY = .067 + brows * .012 + (a.cara === 4 ? .015 : 0);
    const tilt = a.cara === 6 ? side * -.013 : a.cara === 5 ? side * .005 : .003;
    patch([[centerX - .041, browY - tilt], [centerX - .035, browY + .010 - tilt],
      [centerX + .004, browY + .017], [centerX + .042, browY + tilt],
      [centerX + .033, browY - .003 + tilt], [centerX, browY + .005]], p.hair, .008);
  }
  const nw = .028 + nose * .007, tip = -.191 - nose * .016;
  const nosePoints: V[] = [[-.011, .035, -.145], [.011, .035, -.145],
    [nw, -.057, -.143], [.008, -.047, tip], [-.011, -.048, tip + .003],
    [-nw, -.057, -.143], [0, -.069, -.173]];
  k.add(head, k.mesh(nosePoints, [[0, 1, 3, 4], [1, 2, 3], [0, 4, 5], [5, 4, 6], [4, 3, 6], [3, 2, 6]]), p.skin, [0, 0, 0]);
  k.add(head, k.mesh(nosePoints, [[5, 6, 2]]), skinShade, [0, 0, 0]);
  const smile = [0, 1, 5].includes(a.cara) ? .009 : a.cara === 6 ? -.003 : 0;
  const gap = a.cara === 1 ? .018 : a.cara === 4 ? .027 : .002;
  const width = a.cara === 4 ? .028 : .053 + lips * .007;
  const mouth: V[][] = Array.from({ length: 7 }, (_, i) => {
    const u = i / 3 - 1, x = u * width, full = Math.max(0, 1 - u * u);
    const y = -.123 + smile * u * u + (a.cara === 5 ? u * .006 : 0);
    const z = depth(x, y) - .006;
    return [[x, y + (.006 + lips * .002) * full, z], [x, y, z - .002],
      [x, y - gap * full, z - .002], [x, y - (gap + .008 + lips * .003) * full, z]];
  });
  for (const [top, bottom, color] of [[0, 1, lip], [1, 2, p.ink], [2, 3, lip]] as const) {
    const points = mouth.flatMap(row => [row[top], row[bottom]]);
    const faces = mouth.slice(1).map((_, i) => [i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1]);
    k.add(head, k.mesh(points, faces), color, [0, 0, 0]);
  }
  if (a.detalle === 1) for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = side * (.055 + i * .016), y = -.045 - i % 2 * .009;
    k.add(head, poly, p.hair, [x, y, depth(x, y) - .004], [.0022, .0022, .001]);
  }
  if (a.detalle === 2 || a.detalle === 3) k.add(head, poly, p.hair, [0, -.099, -.158], [.067, .017, .012]);
  if (a.detalle === 3 || a.detalle === 4) k.add(head, poly, p.hair, [0, -.171, -.105], [.125, .061, .048]);
  if (a.detalle === 5) k.add(head, poly, p.ink, [.105, -.078, depth(.105, -.078) - .003], [.004, .004, .002]);
  if (a.detalle === 6) k.add(head, block, p.mint, [.113, -.077, -.122], [.036, .013, .005], [0, -.4, -.35]);
}

function addHair(k: Kit, head: T.Group, a: Avatar, p: Palette) {
  const style = a.pelo, helmet = a.gorro === 6;
  const fitted = [2, 3, 4, 5, 6].includes(a.gorro);
  const root = new T.Group();
  root.scale.setScalar(helmet ? .91 : fitted ? .96 : 1);
  head.add(root);
  const shade = k.shade(p.hair, .035), dark = k.shade(p.hair, -.018);
  const curl = k.geo(new T.SphereGeometry(1, 7, 4));
  const tuft = (position: V, scale: V, rotate: V, index: number) => {
    if (fitted && position[1] > .11) return;
    k.add(root, curl, index % 5 === 0 ? shade : index % 4 === 0 ? dark : p.hair, position, scale, rotate);
  };
  // La envolvente es cabello; evita claros en la nuca, incluso al girar el avatar.
  const scalp: V[] = [], faces: number[][] = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6, front = Math.cos(angle);
    const edge = .119 - .113 * (1 - front);
    const height = row / 3;
    const radius = [1, .96, .70, .10][row];
    scalp.push([Math.sin(angle) * .182 * radius,
      T.MathUtils.lerp(edge, style === 5 ? .237 : .254, height),
      .012 - front * .171 * radius]);
    if (row) {
      const a = (row - 1) * 12 + i, b = (row - 1) * 12 + (i + 1) % 12;
      faces.push([a, a + 12, b + 12, b]);
    }
  }
  faces.push(Array.from({ length: 12 }, (_, i) => 47 - i));
  k.add(root, k.mesh(scalp, faces), p.hair, [0, 0, 0]);
  if (style === 5) return;
  if (style === 3 || style === 6) {
    // Racimos anchos e irregulares, sin tubos ni mechones de textura.
    const rows = style === 6 ? 4 : 3;
    for (let row = 0; row < rows; row++) for (let i = 0; i < 10; i++) {
      const theta = (i + row * .46) * Math.PI / 5;
      const front = Math.cos(theta) > .30;
      if (row < 2 && front) continue;
      const broad = style === 6 ? 1.15 : 1;
      const radius = row === 0 ? .185 : row === rows - 1 ? .157 : .185;
      const y = row === 0 ? -.079 : row === 1 ? .057 : .196 + (row - 2) * .055;
      const variation = 1 + .08 * Math.sin(i * 4.3 + row * 2.7);
      tuft([Math.sin(theta) * radius * broad, y + Math.sin(i * 2.1) * .015,
        -.004 - Math.cos(theta) * .153 * broad],
      [.081 * variation * broad, .091 * variation, .077 * broad], [i * .39, row * .7 + i * .19, i * .61], row * 10 + i);
    }
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      tuft([-.145 + t * .284, .220 + Math.sin(t * Math.PI) * .033, -.105 - Math.sin(t * 3.4) * .020],
        [.081, .069 + t * .009, .073], [.35 + t, t * .8, -.3 + t], 33 + i);
    }
    tuft([-.036, .263, -.035], [.112, .065, .105], [.3, .4, -.15], 39);
    return;
  }
  for (let i = 0; i < 5; i++) tuft([-.13 + i * .062, .188 + Math.sin(i * .85) * .028, -.127],
    [.088, .065, .077], [.1, i * .3, -.3 + i * .17], i);
  if (style === 1) tuft([.077, .087, -.155], [.088, .107, .055], [.25, .1, -.30], 6);
  if (style === 2 || style === 8) {
    for (const side of [-1, 1]) tuft([side * .176, -.076, .045],
      [.073, style === 2 ? .250 : .165, .138], [0, side * .2, side * -.08], side + 8);
    tuft([0, -.107, .157], [.172, style === 2 ? .22 : .15, .071], [0, 0, .1], 9);
  }
  if (style === 4) tuft([0, .281, .111], [.105, .092, .092], [.1, .3, 0], 5);
  if (style === 7) {
    tuft([.035, -.027, .205], [.069, .175, .071], [-.25, 0, 0], 8);
    tuft([.045, -.212, .245], [.052, .100, .047], [-.30, 0, .1], 9);
  }
  if (style === 9) for (let i = 0; i < 5; i++) tuft([0, .265 - i * .012, -.10 + i * .062],
    [.047, .095 - i * .008, .053], [0, .4, 0], i);
}

function addOutfit(k: Kit, body: T.Group, a: Avatar, p: Palette) {
  const wide = a.ropa === 5 ? 1.08 : 1;
  const shape = k.layers([
    { y: -.111, w: .205, front: .123, back: .112 },
    { y: .025, w: .177, front: .125, back: .107 },
    { y: .206, w: .224, front: .151, back: .114 },
    { y: .336, w: .269 * wide, front: .111, back: .102 },
    { y: .389, w: .197, front: .095, back: .089 },
    { y: .431, w: .094, front: .068, back: .067 },
  ]);
  k.add(body, shape, p.suit, [0, 0, 0]);
  k.add(body, poly, p.skin, [0, .480, -.004], [.071, .091, .071]);
  if (a.ropa === 1) {
    k.add(body, band, p.trim, [0, .427, .006], [.126, .088, .037], [Math.PI / 2, 0, 0]);
    k.add(body, block, p.trim, [0, .085, -.128], [.211, .054, .013]);
  } else if (a.ropa === 2) {
    for (const side of [-1, 1]) k.add(body, k.mesh([
      [side * .025, .433, -.068], [side * .086, .444, -.064],
      [side * .143, .383, -.092], [side * .081, .349, -.120],
    ], [[0, 1, 2, 3]]), p.mint, [0, 0, 0]);
    k.link(body, p.trim, [0, -.084, -.127], [0, .339, -.118], .010, .004);
  } else if (a.ropa >= 4) {
    // Cuello abierto, separado del mentón y con borde menta de la lámina.
    for (const side of [-1, 1]) {
      k.add(body, k.mesh([
        [side * .025, .427, -.070], [side * .073, .506, -.028],
        [side * .122, .489, .054], [side * .145, .412, .079],
        [side * .107, .405, -.052],
      ], [[0, 1, 4], [1, 2, 3, 4]]), p.suit, [0, 0, 0]);
    }
    k.link(body, p.mint, [.073, .507, -.029], [.026, .427, -.073], .009, .008);
    const seam: V[] = [[0, -.08, -.128], [0, .025, -.131], [0, .206, -.157], [0, .339, -.120]];
    for (let i = 1; i < seam.length; i++) k.link(body, p.trim, seam[i - 1], seam[i], .017, .005);
    k.add(body, block, p.mint, [0, .306, -.130], [.011, .032, .007]);
  }
  if (a.ropa === 3 || a.ropa >= 4) {
    k.add(body, block, p.mint, [-.126, .274, -.130], [.092, .021, .007], [0, -.2, -.06]);
  }
  if (a.ropa >= 4) {
    const pad = k.mesh([[-.314, .316, -.079], [-.276, .375, -.073], [-.211, .389, -.054],
      [-.198, .376, .062], [-.256, .361, .090], [-.307, .300, .069]], [[0, 1, 2], [0, 2, 3, 5], [3, 4, 5]]);
    k.add(body, pad, p.cyan, [0, 0, 0]);
    k.add(body, block, p.trim, [0, -.046, -.003], [.415, .047, .239]);
    k.add(body, block, p.mint, [0, -.046, -.129], [.080, .048, .011]);
  }
  if (a.ropa === 5) {
    k.add(body, block, p.trim, [0, .173, -.161], [.169, .102, .040]);
    k.add(body, block, p.mint, [0, .191, -.184], [.114, .018, .008]);
  }
}

function addArm(k: Kit, a: Avatar, p: Palette, seated: boolean) {
  const root = new T.Group();
  const short = a.ropa === 0 || a.ropa === 3;
  const upper = k.layers([
    { y: .014, w: .058, front: .060, back: .053 },
    { y: -.031, w: .076, front: .077, back: .061 },
    { y: -.151, w: .061, front: .059, back: .053 },
    { y: -.291, w: .048, front: .050, back: .044 },
  ], 6);
  k.add(root, upper, short ? p.skin : p.suit, [0, 0, 0]);
  if (short) k.add(root, k.layers([
    { y: .016, w: .062, front: .064, back: .057 },
    { y: -.031, w: .081, front: .081, back: .065 },
    { y: -.101, w: .071, front: .070, back: .061 },
  ], 6), p.suit, [0, 0, 0]);
  const lower = new T.Group();
  lower.position.y = -.286;
  lower.rotation.x = seated ? .88 : .06;
  root.add(lower);
  k.add(lower, k.layers([
    { y: .015, w: .049, front: .051, back: .044 },
    { y: -.073, w: .056, front: .051, back: .044 },
    { y: -.211, w: .035, front: .035, back: .030 },
  ], 6), short ? p.skin : p.suit, [0, 0, 0]);
  if (!short) k.add(lower, block, p.trim, [0, -.208, 0], [.071, .023, .064]);
  k.add(lower, k.layers([
    { y: -.215, w: .030, front: .022, back: .022 },
    { y: -.245, w: .041, front: .022, back: .021 },
    { y: -.307, w: .028, front: .021, back: .018 },
  ], 6), p.skin, [0, 0, -.007]);
  k.add(lower, poly, p.skin, [.034, -.252, -.018], [.019, .035, .017], [0, 0, -.30]);
  return root;
}

function addLegs(k: Kit, p: Palette, seated: boolean) {
  const shape = new T.Group();
  k.add(shape, k.layers([
    { y: -.045, w: .183, front: .104, back: .091 },
    { y: .057, w: .198, front: .115, back: .103 },
    { y: .133, w: .202, front: .120, back: .106 },
  ]), p.suit, [0, 0, 0]);
  for (const side of [-1, 1]) {
    if (seated) {
      k.add(shape, poly, p.suit, [side * .108, .005, -.130], [.099, .106, .220]);
      k.add(shape, poly, p.suit, [side * .108, -.233, -.291], [.066, .207, .069]);
      k.add(shape, poly, p.trim, [side * .108, -.430, -.333], [.074, .055, .119]);
    } else {
      const leg = k.layers([
        { y: .060, w: .095, front: .109, back: .091 },
        { y: -.107, w: .084, front: .089, back: .071 },
        { y: -.340, w: .058, front: .059, back: .058 },
        { y: -.448, w: .059, front: .064, back: .056 },
        { y: -.721, w: .043, front: .044, back: .039 },
      ], 6);
      k.add(shape, leg, p.suit, [side * .103, 0, 0]);
      k.add(shape, poly, p.trim, [side * .103, -.754, -.028], [.059, .054, .105]);
    }
  }
  return shape;
}

// Piezas intercambiables de la lámina 05. Los índices coinciden con CONFIG.
function commandStar(k: Kit): T.BufferGeometry {
  const points: V[] = [[0, 0, 0]];
  const faces: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 - i * Math.PI / 5;
    const radius = i % 2 ? .45 : 1;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
    faces.push([0, i + 1, (i + 1) % 10 + 1]);
  }
  return k.mesh(points, faces);
}

function addHeadwear(k: Kit, head: T.Group, a: Avatar, p: Palette): void {
  switch (a.gorro) {
    case 1: { // Vincha abierta; deja visibles los rulos.
      const arch = k.geo(new T.TorusGeometry(1, .10, 4, 10, Math.PI));
      k.add(head, arch, p.hat, [0, .018, .018], [.246, .272, .43]);
      k.add(head, block, p.cyan, [0, .293, .015], [.09, .012, .057]);
      break;
    }
    case 2: { // Gorra de copa facetada y visera de pocos planos.
      const crown = k.geo(new T.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2));
      k.add(head, crown, p.hat, [0, .159, .016], [.25, .153, .231]);
      const brim = k.mesh([
        [-.19, 0, .015], [.19, 0, .015], [.20, -.012, -.16],
        [.12, -.025, -.24], [-.12, -.025, -.24], [-.20, -.012, -.16],
        [-.19, -.023, .015], [.19, -.023, .015], [.20, -.035, -.16],
        [.12, -.048, -.24], [-.12, -.048, -.24], [-.20, -.035, -.16],
      ], [[0, 1, 2, 3, 4, 5], [11, 10, 9, 8, 7, 6], [0, 6, 7, 1],
        [1, 7, 8, 2], [2, 8, 9, 3], [3, 9, 10, 4], [4, 10, 11, 5], [5, 11, 6, 0]]);
      k.add(head, brim, p.hat, [0, .16, -.112]);
      k.add(head, block, p.cyan, [0, .225, -.192], [.045, .10, .014], [-.42, 0, 0]);
      break;
    }
    case 3: { // El gorro sugiere lana por la silueta, sin textura tejida.
      const cap = k.geo(new T.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2));
      k.add(head, cap, p.hat, [0, .126, .025], [.25, .228, .23]);
      const cuff = k.geo(new T.CylinderGeometry(1, 1, 1, 10, 1, true));
      k.add(head, cuff, p.hat, [0, .139, .025], [.252, .065, .231]);
      k.add(head, poly, p.cyan, [0, .392, .025], [.053, .055, .053]);
      break;
    }
    case 4: { // Boina inclinada, con pequeño rabito.
      k.add(head, poly, p.hat, [-.035, .245, .018], [.285, .11, .246], [0, 0, .16]);
      k.add(head, tube, p.hat, [-.039, .35, .018], [.012, .044, .012], [0, 0, -.17]);
      break;
    }
    case 5: { // Galera.
      k.add(head, tube, p.hat, [0, .233, .025], [.265, .027, .244]);
      k.add(head, tube, p.hat, [0, .356, .025], [.181, .235, .17]);
      k.add(head, tube, p.cyan, [0, .267, .025], [.184, .035, .173]);
      break;
    }
    case 6: { // Casco espacial abierto: el marco no oculta la cara.
      const rear = k.geo(new T.SphereGeometry(1, 10, 6, 0, Math.PI));
      k.add(head, rear, p.hat, [0, 0, .033], [.275, .312, .254]);
      const opening = k.geo(new T.TorusGeometry(1, .12, 4, 10));
      k.add(head, opening, p.hat, [0, .008, -.202], [.238, .27, .33]);
      k.add(head, ring, p.trim, [0, .008, -.235], [.219, .25, .18]);
      for (const side of [-1, 1]) {
        k.add(head, poly, p.trim, [side * .264, -.015, .027], [.043, .10, .08]);
        k.add(head, block, p.cyan, [side * .294, -.008, -.008], [.014, .073, .037]);
      }
      k.add(head, block, p.cyan, [0, .291, -.082], [.084, .019, .052], [.2, 0, 0]);
      k.add(head, block, p.mint, [0, -.283, -.204], [.076, .017, .024]);
      break;
    }
    case 7: { // Corona de cinco puntas visibles, con volumen real.
      k.add(head, tube, p.hat, [0, .218, .02], [.238, .052, .216]);
      const tip = k.geo(new T.ConeGeometry(.057, .151, 4));
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        const x = Math.cos(angle) * .215;
        const z = .02 + Math.sin(angle) * .195;
        k.add(head, tip, p.hat, [x, .305, z], [1, 1, 1], [0, angle, 0]);
        k.add(head, poly, p.cyan, [x * 1.02, .237, .02 + (z - .02) * 1.02], [.022, .029, .018]);
      }
      break;
    }
  }
}

function addEyewear(k: Kit, head: T.Group, a: Avatar, p: Palette): void {
  if (!a.lentes) return;
  if (a.lentes === 10) {
    // Una superficie plana por faceta; el visor se separa del casco.
    const frame = k.mesh([
      [-.202, .071, -.169], [-.11, .094, -.221], [.11, .094, -.221], [.202, .071, -.169],
      [.196, -.065, -.17], [.067, -.079, -.226], [0, -.037, -.24], [-.067, -.079, -.226], [-.196, -.065, -.17],
    ], [[0, 1, 7, 8], [1, 2, 5, 6, 7], [2, 3, 4, 5]]);
    k.add(head, frame, p.glasses, [0, -.006, 0]);
    const lens = k.mesh([
      [-.179, .054, -.19], [-.103, .075, -.238], [.103, .075, -.238], [.179, .054, -.19],
      [.174, -.046, -.191], [.065, -.059, -.243], [0, -.019, -.257], [-.065, -.059, -.243], [-.174, -.046, -.191],
    ], [[0, 1, 7, 8], [1, 2, 5, 6, 7], [2, 3, 4, 5]]);
    k.add(head, lens, p.cyan, [0, -.006, 0]);
    const glint = k.mesh([[-.1, .06, -.244], [-.04, .06, -.244], [-.1, -.045, -.25]], [[0, 1, 2]]);
    k.add(head, glint, p.mint, [0, -.006, -.001]);
    for (const side of [-1, 1]) {
      k.add(head, block, p.glasses, [side * .194, .005, -.101], [.025, .029, .15]);
      k.add(head, block, p.cyan, [side * .211, .005, -.105], [.009, .044, .034]);
    }
    return;
  }

  const square = [2, 5, 8].includes(a.lentes);
  const count = square ? 4 : a.lentes === 7 ? 6 : 12;
  let shape: T.BufferGeometry = ring;
  if (square || a.lentes === 7) shape = k.geo(new T.TorusGeometry(1, .09, 4, count).rotateZ(square ? Math.PI / 4 : Math.PI / 6));
  if (a.lentes === 5) shape = k.geo(new T.TorusGeometry(1, .095, 4, 10, Math.PI));
  const width = a.lentes === 8 ? .062 : [3, 9].includes(a.lentes) ? .077 : .069;
  const height = a.lentes === 8 ? .034 : a.lentes === 2 ? .043 : a.lentes === 3 ? .069 : .058;
  for (const side of [-1, 1]) {
    const tilt = a.lentes === 4 ? side * .20 : a.lentes === 6 ? -side * .10 : 0;
    k.add(head, shape, p.glasses, [side * .081, .023, -.166], [width, height, .075], [0, -side * .23, tilt]);
    k.link(head, p.glasses, [side * .15, .028, -.15], [side * .176, .021, .016], .009, .009);
    if (a.lentes === 9) k.add(head, poly, p.ink, [side * .081, .023, -.168], [.073, .05, .009]);
  }
  k.link(head, p.glasses, [-.013, .032, -.175], [.013, .032, -.175], .009, .011);
}

function addAccessory(k: Kit, head: T.Group, torso: T.Group, a: Avatar, p: Palette): void {
  switch (a.acc) {
    case 1: { // Aros: par de rombos huecos, una sola opción del catálogo.
      const diamond = k.geo(new T.TorusGeometry(1, .13, 4, 4).rotateZ(Math.PI / 4));
      for (const side of [-1, 1]) {
        k.add(head, poly, p.trim, [side * .198, -.078, -.02], [.01, .013, .01]);
        k.add(head, diamond, p.accessory, [side * .21, -.131, -.018], [.028, .043, .12]);
      }
      break;
    }
    case 2: { // Auriculares con carcasa octogonal y micrófono articulado.
      if (a.gorro !== 6) {
        const arch = k.geo(new T.TorusGeometry(1, .07, 4, 10, Math.PI));
        k.add(head, arch, p.trim, [0, .018, .033], [.247, .274, .44]);
      }
      const housing = k.geo(new T.CylinderGeometry(1, 1, 1, 8));
      const sideX = a.gorro === 6 ? .295 : .237;
      for (const side of [-1, 1]) {
        k.add(head, housing, p.trim, [side * sideX, -.012, .006], [.078, .055, .068], [0, 0, Math.PI / 2]);
        k.add(head, housing, p.accessory, [side * (sideX + .031), -.012, .006], [.055, .012, .048], [0, 0, Math.PI / 2]);
        k.add(head, block, p.cyan, [side * (sideX + .039), -.006, -.009], [.01, .047, .014]);
      }
      k.link(head, p.trim, [-sideX, -.054, -.018], [-sideX, -.088, -.143], .017, .019);
      k.link(head, p.trim, [-sideX, -.088, -.143], [-.125, -.098, -.249], .017, .019);
      k.add(head, block, p.ink, [-.111, -.098, -.254], [.04, .020, .023], [0, -.22, 0]);
      break;
    }
    case 3: { // Moño de cuello.
      for (const side of [-1, 1]) k.add(torso, poly, p.accessory, [side * .056, .386, -.133], [.073, .037, .022], [0, 0, side * .12]);
      k.add(torso, block, p.mint, [0, .386, -.155], [.034, .037, .019]);
      break;
    }
    case 4: { // Bufanda con dos puntas y cuello ancho.
      k.add(torso, band, p.accessory, [0, .426, -.008], [.154, .123, .23], [Math.PI / 2, 0, 0]);
      k.add(torso, block, p.accessory, [-.06, .285, -.15], [.069, .25, .027], [0, 0, -.09]);
      k.add(torso, block, p.accessory, [.06, .283, -.15], [.069, .25, .027], [0, 0, .09]);
      for (const side of [-1, 1]) k.add(torso, block, p.cyan, [side * .069, .178, -.166], [.066, .022, .009], [0, 0, side * .09]);
      break;
    }
    case 5: { // Medalla y cinta en V.
      k.link(torso, p.accessory, [-.088, .437, -.078], [0, .268, -.17], .017, .008);
      k.link(torso, p.accessory, [.088, .437, -.078], [0, .268, -.17], .017, .008);
      k.add(torso, poly, p.gold, [0, .229, -.18], [.054, .055, .013]);
      k.add(torso, commandStar(k), p.mint, [0, .229, -.194], [.029, .029, 1]);
      break;
    }
    case 6: { // Antenas con base de vincha y bolitas poligonales.
      const arch = k.geo(new T.TorusGeometry(1, .07, 4, 10, Math.PI));
      k.add(head, arch, p.trim, [0, .018, .033], [.247, .274, .35]);
      for (const side of [-1, 1]) {
        k.link(head, p.accessory, [side * .105, .271, .027], [side * .154, .428, .027], .014);
        k.add(head, poly, p.cyan, [side * .159, .454, .027], [.035, .036, .035]);
      }
      break;
    }
    case 7: { // Estrella de comando en el pecho.
      const star = commandStar(k);
      k.add(torso, star, p.gold, [-.128, .299, -.157], [.056, .056, 1]);
      k.add(torso, star, p.accessory, [-.128, .299, -.159], [.039, .039, 1]);
      break;
    }
  }
}


export interface PilotOptions { seated?: boolean; closeup?: boolean }

export function makePilot(seat: number, raw?: Avatar, { seated = true }: PilotOptions = {}) {
  const a = cleanAvatar(raw ?? REFERENCE_AVATAR), k = new Kit(), p = palette(k, a);
  const torsoSource = new T.Group(), headSource = new T.Group();
  addOutfit(k, torsoSource, a, p);
  addFace(k, headSource, a, p);
  addHair(k, headSource, a, p);
  addHeadwear(k, headSource, a, p);
  addEyewear(k, headSource, a, p);
  addAccessory(k, headSource, torsoSource, a, p);
  const torso = k.combine(torsoSource), head = k.combine(headSource);
  head.position.set(0, .689, -.031);
  torso.add(head);
  torso.position.y = .22;
  const legs = k.combine(addLegs(k, p, seated));
  const arms = [-1, 1].map(side => {
    const arm = k.combine(addArm(k, a, p, seated));
    arm.position.set(side * .274, .338, .005);
    torso.add(arm);
    return arm;
  });
  const object = new T.Group();
  object.add(torso, legs);
  const [x, y, z] = crewSeats[seat] ?? crewSeats[0];
  object.position.set(x, y, z);
  const direction = seat % 2 ? 1 : -1;
  object.rotation.y = direction * .65;
  k.done();
  return {
    object,
    pose(seconds: number, action: number, reduced: boolean, kind?: CabinEffect['kind']) {
      const amount = Math.sin(Math.PI * T.MathUtils.clamp(action, 0, 1));
      const reach = kind === 'ok' ? amount : 0, recoil = kind === 'error' ? amount : 0;
      const signal = kind === 'help' ? amount : 0, cheer = kind === 'celebrate' ? amount : 0;
      torso.rotation.x = (seated ? -.10 : -.015) - reach * .14 + recoil * .43 - cheer * .07;
      torso.rotation.z = (reduced ? 0 : Math.sin(seconds * 1.4 + seat) * .019) + direction * signal * .22;
      head.rotation.set(reach * .19 - recoil * .31 - cheer * .12, direction * (.18 + reach * .23 + signal * .35), 0);
      const rest = seated ? .25 : .025;
      arms[0].rotation.set(rest + recoil * .57 + cheer * 2.54, 0, -.055 - signal * 1.35 - cheer * .35);
      arms[1].rotation.set(rest + reach * 1.25 + recoil * .47 + cheer * 2.44, 0, .055 + reach * .2 + cheer * .39);
    },
  };
}
