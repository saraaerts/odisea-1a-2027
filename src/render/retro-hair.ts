import * as T from 'three';
import { piece, seeded } from './model.ts';
import { curlMaterial } from './retro-hair-material.ts';

type Point = [number, number, number];
type GuidePoint = [x: number, y: number, z: number, width: number, depth: number];
type Guide = readonly GuidePoint[];
const hairShapes = new Map<number, { base: T.BufferGeometry; detail: T.BufferGeometry }>();

const turn = Math.PI * 2;
const lerp = T.MathUtils.lerp;
const hairline = [.136, .146, .142, .097, .023, -.055, -.136, -.176, -.188, -.189,
  -.184, -.183, -.176, -.169, -.144, -.096, -.022, .044, .104, .118];
const profile = [
  [0, .142, .138], [.07, .176, .165], [.20, .206, .188], [.36, .223, .201],
  [.48, .221, .201], [.63, .202, .184], [.76, .165, .153], [.86, .128, .122],
  [.94, .084, .082], [.985, .041, .040], [1, .001, .001],
] as const;

function border(theta: number) {
  const position = hairline.length * T.MathUtils.euclideanModulo(theta / turn, 1);
  const i = Math.floor(position);
  return lerp(hairline[i], hairline[(i + 1) % hairline.length], position - i);
}

function dome(theta: number, height: number, tucked: boolean, lift = 0): Point {
  const row = Math.max(1, profile.findIndex(([h]) => h >= height));
  const [lo, w0, d0] = profile[row - 1], [hi, w1, d1] = profile[row];
  const ratio = T.MathUtils.clamp((height - lo) / (hi - lo), 0, 1);
  const y = lerp(border(theta), .292, height);
  const tuck = tucked ? T.MathUtils.smoothstep(y, .044, .201) : 0;
  const scallop = (.0044 * Math.sin(theta * 9 - height * 7.6)
    + .0026 * Math.cos(theta * 15 + height * 12)) * (1 - height ** 4);
  const front = Math.max(0, Math.cos(theta)) ** 3;
  const part = .009 * Math.sin(Math.PI * height);
  return [
    Math.sin(theta) * (lerp(w0, w1, ratio) + lift + scallop - tuck * .038) + part,
    y + scallop * .58 - .045 * tuck,
    -Math.cos(theta) * (lerp(d0, d1, ratio) + (1 - front * .06) * lift + scallop - tuck * .037) + .021,
  ];
}

function mesh(positions: number[], uv: number[], colors: number[], faces: number[]) {
  const result = new T.BufferGeometry();
  result.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  result.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  result.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  result.setIndex(faces);
  result.computeVertexNormals();
  return result;
}

function smoothSeam(geometry: T.BufferGeometry, seams: Array<[number, number]>) {
  const normal = new T.Vector3(), opposite = new T.Vector3();
  const normals = geometry.attributes.normal;
  for (const [a, b] of seams) {
    normal.fromBufferAttribute(normals, a).add(opposite.fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z);
    normals.setXYZ(b, normal.x, normal.y, normal.z);
  }
}

function undercoat(tucked: boolean, closeup: boolean) {
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], faces: number[] = [];
  const seam: Array<[number, number]> = [];
  const rows = closeup ? 30 : 16, cols = closeup ? 72 : 36;
  for (let row = 0; row <= rows; row++) {
    const h = row / rows;
    for (let col = 0; col <= cols; col++) {
      const s = col / cols, t = s * turn;
      positions.push(...dome(t, h, tucked));
      const value = .62 + .062 * Math.sin(t * 11 - h * 10) + .049 * Math.cos(t * 17 + h * 27);
      colors.push(value, value * .96, value * .92);
      uv.push(s * 4.0 + h * .12 + .39 * Math.sin(t * 5 + h * 4.9), h + .18 * Math.cos(7 * t + h * 2.2));
      if (!row || !col) continue;
      const a = (row - 1) * (cols + 1) + col - 1, b = a + cols + 1;
      faces.push(a, b, b + 1, a, b + 1, a + 1);
    }
    seam.push([row * (cols + 1), row * (cols + 1) + cols]);
  }
  const result = mesh(positions, uv, colors, faces);
  smoothSeam(result, seam);
  return result;
}

function front(points: [x: number, y: number, z: number, width: number][], fullness = .75): Guide {
  return points.map(([x, y, z, w]) => [x, y, z, w, w * fullness]);
}

// La onda principal deja una vuelta abierta sobre la raya y vuelve hacia el volumen de la coronilla.
const fringe: Guide[] = [
  front([[.136, .120, -.119, .005], [.108, .143, -.150, .022], [.071, .176, -.181, .030],
    [.049, .224, -.187, .032], [.027, .271, -.170, .031], [-.005, .292, -.139, .028],
    [-.049, .275, -.110, .026], [-.064, .235, -.106, .021], [-.051, .211, -.111, .015],
    [-.018, .218, -.109, .004]], .80),
  front([[.176, .128, -.086, .005], [.153, .172, -.129, .024], [.115, .204, -.148, .033],
    [.084, .240, -.145, .031], [.066, .275, -.124, .024], [.030, .291, -.108, .005]], .83),
  front([[.158, .052, -.114, .007], [.196, .095, -.122, .025], [.207, .143, -.120, .030],
    [.175, .171, -.115, .024], [.152, .147, -.128, .007]], .82),
  front([[-.064, .241, -.112, .005], [-.091, .242, -.136, .024], [-.131, .214, -.154, .030],
    [-.160, .166, -.145, .026], [-.170, .125, -.135, .022], [-.142, .115, -.136, .011],
    [-.126, .133, -.117, .004]], .84),
  front([[-.168, .190, -.100, .008], [-.202, .158, -.112, .024], [-.217, .107, -.095, .029],
    [-.194, .059, -.092, .025], [-.158, .042, -.091, .005]], .75),
  front([[.175, .112, -.055, .007], [.223, .096, -.079, .024], [.231, .049, -.082, .027],
    [.218, .007, -.086, .023], [.181, -.014, -.059, .009]], .86),
  front([[-.190, .053, -.057, .005], [-.212, .034, -.057, .022], [-.223, -.015, -.063, .024],
    [-.204, -.054, -.058, .020], [-.180, -.038, -.039, .004]], .80),
  front([[.200, .009, -.069, .006], [.224, -.028, -.071, .023], [.237, -.065, -.079, .029],
    [.222, -.106, -.063, .025], [.195, -.115, -.053, .021], [.177, -.089, -.043, .004]], .74),
];

function coil(theta: number, y: number, random: () => number, tucked: boolean, scale = 1): Guide {
  const reverse = random() < .33 ? -1 : 1;
  const spin = lerp(3.1, 6.6, random());
  const start = lerp(-2.1, 2.9, random());
  const size = lerp(.80, 1.21, random()) * scale;
  const rise = lerp(.029, .051, random()) * size;
  const lateral = lerp(.17, .33, random()) * size;
  const drop = lerp(.026, .085, random());
  const baseWidth = lerp(.016, .025, random()) * size;
  const roundness = lerp(.70, .91, random());
  const drift = lerp(-.23, .14, random());
  return Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    const angle = start + reverse * spin * t;
    const sizeAt = lerp(1.08, .44, t);
    const thetaAt = theta + lateral * sizeAt * Math.cos(angle) + drift * (t - .5);
    const floor = border(thetaAt);
    const curlY = y + sizeAt * rise * Math.sin(angle) - drop * (t - .48);
    const h = T.MathUtils.clamp((curlY - floor) / (.292 - floor), .026, .96);
    const arc = Math.sin(Math.PI * t) ** .64;
    const lift = lerp(-.024, .017 + size * .006, arc);
    const width = lerp(.0021, baseWidth, arc) * (1 + .11 * Math.sin(4.8 * t + start));
    return [...dome(thetaAt, h, tucked, lift), width, width * roundness];
  });
}

function clumps(tucked: boolean, closeup: boolean) {
  const random = seeded(205021);
  const guides: Guide[] = tucked ? [] : [...fringe];
  const levels = tucked ? [.057, -.029, -.103] : [.216, .146, .068, -.016, -.091, -.139];
  for (const [row, y] of levels.entries()) {
    const span = !tucked && row === 0 ? 4.79 : 4.30;
    const count = closeup ? 11 : 8;
    for (let i = 0; i < count; i++) {
      const theta = Math.PI + span * ((i + .20 + random() * .6) / count - .5) + (row % 2 ? .12 : -.07);
      const stagger = (random() - .5) * .054;
      guides.push(coil(theta, y + stagger, random, tucked));
    }
  }
  if (closeup) for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      const theta = Math.PI + ((col + .7 * random()) / 6 - .5) * 3.86 + .13 * Math.sin(row * 2.3);
      const y = .164 - row * .069 - random() * .037;
      if (tucked && y > .025) continue;
      guides.push(coil(theta, y, random, tucked, .70));
    }
  }
  return guides;
}

function curls(guides: Guide[], closeup: boolean) {
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], faces: number[] = [];
  const seam: Array<[number, number]> = [];
  const random = seeded(561407);
  const center = new T.Vector3(), tangent = new T.Vector3(), across = new T.Vector3(), out = new T.Vector3();
  const root = new T.Vector3(), local = new T.Vector3();
  for (const [index, guide] of guides.entries()) {
    const start = positions.length / 3;
    const hero = index < fringe.length;
    const rows = closeup ? hero ? 44 : 24 : hero ? 21 : 11;
    const cols = closeup ? hero ? 24 : 13 : hero ? 12 : 7;
    const spine = new T.CatmullRomCurve3(guide.map(([x, y, z]) => new T.Vector3(x, y, z)));
    const widthPhase = random() * turn;
    const offset = random();
    const base = lerp(.83, 1.12, random());
    const frameAt = (t: number) => {
      spine.getPoint(t, center);
      spine.getTangent(t, tangent);
      // Conservá la sección suave al cruzar la coronilla y el centro de una vuelta.
      out.set(center.x + .007, (center.y + .022) * .77, center.z - .022).normalize();
      across.crossVectors(out, tangent).normalize();
      out.crossVectors(tangent, across).normalize();
      const p = t * (guide.length - 1);
      const i = Math.min(guide.length - 2, Math.floor(p)), u = p - i;
      const width = lerp(guide[i][3], guide[i + 1][3], u);
      const depth = lerp(guide[i][4], guide[i + 1][4], u);
      return { width, depth };
    };
    const at = (width: number, depth: number, angle: number, t: number, lift: number) => {
      const groove = 1 + .044 * Math.sin(5 * angle - t * 4.9 + widthPhase)
        + .032 * Math.sin(9 * angle + 5.8 * t);
      return local.copy(center)
        .addScaledVector(across, Math.cos(angle) * (width * groove + lift))
        .addScaledVector(out, Math.sin(angle) * (depth * groove + lift));
    };
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const { width, depth } = frameAt(t);
      const fullness = Math.sin(Math.PI * t) ** .45;
      for (let col = 0; col <= cols; col++) {
        const u = col / cols, angle = u * turn - Math.PI / 2;
        const p = at(width, depth, angle, t, 0);
        positions.push(p.x, p.y, p.z);
        const crest = Math.max(0, Math.sin(angle + .19 * Math.sin(t * 7 + widthPhase)));
        const shade = .82 + .21 * crest + .10 * Math.sin(t * 8.9 + angle * 1.2 + widthPhase);
        const tone = base * shade * (.69 + .33 * fullness);
        colors.push(tone * (1.01 + .09 * crest), tone, tone * (.98 - .055 * crest));
        uv.push(u * .68 + offset + t * .085, t + widthPhase / turn);
        if (!row || !col) continue;
        const a = start + (row - 1) * (cols + 1) + col - 1, b = a + cols + 1;
        faces.push(a, a + 1, b + 1, a, b + 1, b);
      }
      seam.push([start + row * (cols + 1), start + row * (cols + 1) + cols]);
    }
    if (!closeup) continue;

    // Cada hebra que se despega del mechón tiene su propio recorrido, largo y grosor.
    const threads = hero ? 38 : 17;
    for (let thread = 0; thread < threads; thread++) {
      const startFiber = positions.length / 3;
      const phase = random() * turn;
      const stop = lerp(.54, .98, random()), begin = lerp(.024, .31, random());
      const bend = lerp(-.71, .71, random());
      const angle = lerp(-.20, Math.PI + .29, random());
      const rise = lerp(.0012, thread < 2 ? .011 : .0042, random());
      const thickness = lerp(.00033, .00095, random());
      const tone = base * lerp(.66, 1.72, random());
      const steps = hero ? 26 : 17;
      for (let j = 0; j <= steps; j++) {
        const u = j / steps, t = lerp(begin, stop, u);
        const { width, depth } = frameAt(t);
        const arc = Math.sin(Math.PI * u) ** .65;
        const curl = angle + bend * u + .08 * Math.sin(u * 9.8 + phase);
        root.copy(at(width, depth, curl, t, rise * arc - .0006));
        const step = thickness * (.20 + .80 * arc);
        for (const side of [-1, 1]) {
          local.copy(root).addScaledVector(across, -Math.sin(curl) * step * side)
            .addScaledVector(out, Math.cos(curl) * step * side);
          positions.push(local.x, local.y, local.z);
          colors.push(tone * 1.05, tone, tone * .91);
          uv.push(.43 + offset + side * .012, t);
        }
        if (!j) continue;
        const a = startFiber + j * 2 - 2;
        faces.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
  }
  const result = mesh(positions, uv, colors, faces);
  smoothSeam(result, seam);
  return result;
}

export function groomRetroHair(parent: T.Group, color: T.Color, roots: T.BufferGeometry | undefined, tucked: boolean, closeup: boolean) {
  const material = curlMaterial(color, closeup);
  material.side = T.DoubleSide;
  const key = Number(tucked) + Number(closeup) * 2;
  let shape = hairShapes.get(key);
  if (!shape) {
    shape = { base: undercoat(tucked, closeup), detail: curls(clumps(tucked, closeup), closeup) };
    hairShapes.set(key, shape);
  }
  if (roots) {
    const points = roots.attributes.position, coords = roots.attributes.uv;
    const tones: number[] = [];
    for (let i = 0; i < points.count; i++) {
      const y = points.getY(i);
      const angle = Math.atan2(points.getX(i), -points.getZ(i));
      coords.setXY(i, angle / turn * 4.0 + .39, .30 + y * 1.72);
      tones.push(.67, .63, .59);
    }
    roots.setAttribute('color', new T.Float32BufferAttribute(tones, 3));
    piece(parent, roots, material, 0, 0, 0, 1, 1, 1);
  }
  // El avatar agrupa copias de estas mallas. Reutilizá la forma al cambiar el tinte o los rasgos.
  piece(parent, shape.base, material, 0, 0, 0, 1, 1, 1);
  piece(parent, shape.detail, material, 0, 0, 0, 1, 1, 1);
  return roots ? [roots] : [];
}

