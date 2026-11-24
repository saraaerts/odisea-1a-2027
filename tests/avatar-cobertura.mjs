import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const avatarPath = resolve(root, 'src/render/avatar.ts');
const source = await readFile(process.env.ODISEA_AVATAR_SOURCE ?? avatarPath, 'utf8');
const fixture = await build({
  stdin: {
    contents: `import * as Three from 'three';
      export { Three };
      export { AVATAR_OPTIONS, cleanAvatar } from './src/config.ts';
      export { Kit, addFace, addHair, addHeadwear, hairline, skullRows, REFERENCE_AVATAR,
        inspectPilot, makePilot } from './src/render/avatar.ts';
      export { release } from './src/render/model.ts';`,
    resolveDir: root,
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  plugins: [{
    name: 'avatar-cobertura',
    setup(plugin) {
      plugin.onLoad({ filter: /[\\/]src[\\/]render[\\/]avatar\.ts$/ }, () => ({
        // Instrumentá las funciones privadas sin agregar exportaciones al juego.
        contents: source + '\nexport { Kit, addFace, addHair, addHeadwear, hairline, skullRows };',
        loader: 'ts', resolveDir: dirname(avatarPath),
      }));
    },
  }],
});
const module = { exports: {} };
new Function('module', 'exports', fixture.outputFiles[0].text)(module, module.exports);
const { Three: T, AVATAR_OPTIONS: options, cleanAvatar, Kit, addFace, addHair, addHeadwear, hairline,
  skullRows, REFERENCE_AVATAR, inspectPilot, makePilot, release } = module.exports;
const sides = 10;
const tau = 2 * Math.PI;
const modes = { libre: [0], ajustado: [1, 2, 3, 4, 5, 7], casco: [6] };
const counts = key => options[key].map((_, index) => index);
const reference = cleanAvatar({ ...REFERENCE_AVATAR, cara: 0, detalle: 0, acc: 0, gorro: 0, lentes: 0 });
const pointKey = point => [point.x, point.y, point.z].map(coordinate => Math.round(coordinate * 1e6)).join('/');

function facesOf(group) {
  const faces = [];
  group.updateMatrixWorld(true);
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const { geometry } = mesh;
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const points = Array.from({ length: positions.count }, (_, i) =>
      new T.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      faces.push([0, 1, 2].map(offset => points[index ? index.getX(i + offset) : i + offset]));
    }
  });
  return faces;
}

function skullSamples(avatar) {
  const kit = new Kit();
  const head = new T.Group();
  // El material es indiferente para extraer los triángulos de la primera malla.
  const paint = kit.color('#ab7955');
  const colors = Object.fromEntries(['skin', 'hair', 'white', 'ink'].map(key => [key, paint]));
  try {
    addFace(kit, head, avatar, colors);
    const skull = head.children[0];
    assert.ok(skull?.isMesh, 'La primera pieza de la cabeza es el cráneo');
    const group = new T.Group();
    group.add(skull);
    const rows = skullRows(avatar);
    const signedHeights = new Map();
    rows.forEach((row, index) => {
      for (let column = 0; column < sides; column++) {
        const angle = column * tau / sides;
        const z = -Math.cos(angle);
        const point = new T.Vector3(Math.sin(angle) * row.w, row.y, z * (z < 0 ? row.front : row.back));
        signedHeights.set(pointKey(point), { height: row.y - hairline(angle), crown: index === rows.length - 1 });
      }
    });
    const vertices = new Map(), interior = new Map();
    for (const face of facesOf(group)) {
      const properties = face.map(v => signedHeights.get(pointKey(v)));
      assert.ok(properties.every(Boolean), 'Las filas compartidas describen la malla real de addFace');
      const roof = properties.every(p => p.crown);
      const [a, b, c] = face;
      for (let i = 0; i < face.length; i++) {
        if (properties[i].height < -1e-7) continue;
        const vertex = face[i], key = pointKey(vertex);
        vertices.set(key, { point: vertex, top: roof || vertices.get(key)?.top });
      }
      // Usá barycentros en las facetas completas, incluidos los bordes de la tapa.
      const steps = 8;
      for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
        const u = i / steps, v = j / steps, w = 1 - u - v;
        const height = u * properties[0].height + v * properties[1].height + w * properties[2].height;
        if (height <= .0003 || Math.max(u, v, w) === 1) continue;
        const point = a.clone().multiplyScalar(u).addScaledVector(b, v).addScaledVector(c, w);
        const key = pointKey(point);
        interior.set(key, { point, top: roof || interior.get(key)?.top });
      }
      const boundary = [];
      for (let i = 0; i < face.length; i++) {
        const j = (i + 1) % face.length;
        const from = properties[i].height, to = properties[j].height;
        if ((from >= 0) === (to >= 0)) continue;
        boundary.push(face[i].clone().lerp(face[j], from / (from - to)));
      }
      if (boundary.length === 2) {
        const highest = properties.map(property => property.height).indexOf(Math.max(...properties.map(property => property.height)));
        const inside = Math.min(.5, .0005 / properties[highest].height);
        for (const portion of [.2, .5, .8]) {
          const point = boundary[0].clone().lerp(boundary[1], portion).lerp(face[highest], inside);
          interior.set(pointKey(point), { point, top: false });
        }
      }
    }
    assert.ok(vertices.size >= 30 && interior.size >= 800,
      `La prueba cubre vértices, facetas y tapa de la parte alta (${vertices.size} vértices y ${interior.size} puntos)`);
    return { vertices: [...vertices.values()], interior: [...interior.values()] };
  } finally { kit.done(); }
}

const ray = new T.Ray();
const hit = new T.Vector3();
const rayStart = .80;
const nearestSkin = (rayStart - .0001) ** 2;

function intersects(faces, cutoff = nearestSkin) {
  for (const [a, b, c] of faces) {
    // Se pide la cara exterior antes de la piel, con el mismo culling de Three.
    if (ray.intersectTriangle(a, b, c, true, hit) && ray.origin.distanceToSquared(hit) < cutoff) return true;
  }
  return false;
}

function covered({ point, top }, faces) {
  const outward = top ? ray.direction.set(0, 1, 0) : ray.direction.set(point.x, 0, point.z).normalize();
  ray.origin.copy(point).addScaledVector(outward, rayStart);
  if (!top && outward.lengthSq() < .5) return false;
  ray.direction.negate();
  if (intersects(faces)) return true;

  // Three puede rechazar ambos triángulos en una arista común por redondeo.
  // Comprobá ambos lados de la arista desde otra posición hacia el MISMO punto.
  const axis = Math.abs(ray.direction.x) > .5 ? 'z' : 'x';
  const start = ray.origin[axis];
  for (const offset of [-.00001, .00001]) {
    ray.origin[axis] = start + offset;
    ray.direction.copy(point).sub(ray.origin).normalize();
    if (!intersects(faces, (ray.origin.distanceTo(point) - .0001) ** 2)) return false;
  }
  return true;
}

function assertClosedScalp(hair) {
  const first = hair.children[0];
  assert.ok(first?.isMesh, 'Cada peinado incluye el casquete o el forro del casco');
  const group = new T.Group();
  group.add(first.clone());
  const edges = new Map();
  for (const face of facesOf(group)) for (let i = 0; i < 3; i++) {
    const from = pointKey(face[i]), to = pointKey(face[(i + 1) % 3]);
    const forward = from < to;
    const key = forward ? from + '|' + to : to + '|' + from;
    const edge = edges.get(key) ?? { count: 0, direction: 0 };
    edge.count++;
    edge.direction += forward ? 1 : -1;
    edges.set(key, edge);
  }
  for (const edge of edges.values()) assert.ok(edge.count === 2 && edge.direction === 0,
    'Casquete cerrado, con dos caras de sentido opuesto en cada arista');
}

function checkStyle(avatar, mode, samples) {
  const kit = new Kit();
  const hair = new T.Group(), hat = new T.Group();
  const paint = kit.color('#382d25');
  const colors = Object.fromEntries(['hair', 'hat', 'trim', 'cyan'].map(key => [key, paint]));
  try {
    addHair(kit, hair, avatar, colors, mode);
    addHeadwear(kit, hat, avatar, colors);
    assertClosedScalp(hair);
    // Libre y ajustado deben cubrir con pelo. En casco alcanza la unión del casco y su forro.
    const covering = mode === 'casco' ? [...facesOf(hair), ...facesOf(hat)] : facesOf(hair);
    let vertices = 0, interior = 0;
    const examples = [];
    for (const [key, items] of Object.entries(samples)) {
      for (const sample of items) {
        if (covered(sample, covering)) continue;
        if (key === 'vertices') vertices++;
        else interior++;
        if (examples.length < 4) examples.push(sample.point.toArray().map(value => +value.toFixed(5)));
      }
    }
    return { vertices, interior, examples };
  } finally { kit.done(); }
}

assert.ok(hairline(Math.PI) >= -.170 && hairline(Math.PI) <= -.150, 'La nuca termina entre −0,170 y −0,150');
assert.ok(Math.abs(hairline(0) - .119) < 1e-6, 'Se mantiene la línea original de la frente');
const report = options.pelo.map((nombre, pelo) => ({
  pelo, nombre,
  ...Object.fromEntries(Object.keys(modes).map(mode => [mode, { casos: 0, vertices: 0, interior: 0, verticesAfuera: 0, puntosAfuera: 0, ejemplos: [] }])),
}));

for (const jaw of [-2, 0, 2]) for (const cheek of [-2, 0, 2]) {
  const base = cleanAvatar({ ...reference, custom: { jaw, cheek } });
  const samples = skullSamples(base);
  for (const row of report) {
    for (const [mode, hats] of Object.entries(modes)) for (const gorro of hats) for (const acc of [0, 1, 2]) {
      const check = checkStyle({ ...base, pelo: row.pelo, gorro, acc }, mode, samples);
      const tally = row[mode];
      tally.casos++;
      tally.vertices += samples.vertices.length;
      tally.interior += samples.interior.length;
      tally.verticesAfuera += check.vertices;
      tally.puntosAfuera += check.interior;
      if (check.examples.length && tally.ejemplos.length < 4) {
        tally.ejemplos.push({ jaw, cheek, gorro, acc, puntos: check.examples });
      }
    }
  }
}

const coverage = report.map(({ nombre, libre, ajustado, casco }) => ({
  Peinado: nombre,
  'Vértices afuera libre': libre.verticesAfuera, 'Vértices afuera ajustado': ajustado.verticesAfuera, 'Vértices afuera casco': casco.verticesAfuera,
  'Puntos afuera libre': libre.puntosAfuera, 'Puntos afuera ajustado': ajustado.puntosAfuera, 'Puntos afuera casco': casco.puntosAfuera,
}));
console.table(coverage);

function budget() {
  const maxFace = counts('acc').map(acc => {
    let max = { value: -1 };
    for (const cara of counts('cara')) for (const detalle of counts('detalle')) {
      const value = inspectPilot({ ...reference, acc, cara, detalle }).cabeza;
      if (value > max.value) max = { value, cara, detalle };
    }
    return max;
  });
  let peak, peakHead, samples = 0;
  const table = options.pelo.map((nombre, pelo) => ({ pelo, nombre, libre: 0, ajustado: 0, casco: 0 }));
  for (const seated of [true, false]) {
    const maxSuit = counts('gorro').map(gorro => {
      let max = { value: -1 };
      for (const ropa of counts('ropa')) {
        const value = inspectPilot({ ...reference, gorro, ropa }, { seated }).uniforme;
        if (value > max.value) max = { value, ropa };
      }
      return max.ropa;
    });
    for (const row of table) for (const [mode, hats] of Object.entries(modes)) {
      for (const gorro of hats) for (const acc of counts('acc')) for (const lentes of counts('lentes')) {
        const { cara, detalle } = maxFace[acc];
        const avatar = cleanAvatar({ ...reference, pelo: row.pelo, gorro, acc, lentes, ropa: maxSuit[gorro], cara, detalle });
        const measured = inspectPilot(avatar, { seated });
        samples++;
        row[mode] = Math.max(row[mode], measured.pelo);
        assert.ok(measured.total <= 2000 && measured.cabeza + measured.pelo <= 700,
          `Límite de triángulos superado: ${JSON.stringify(avatar)} ${JSON.stringify(measured)}`);
        assert.ok(measured.materiales === (lentes === 10 ? 2 : 1), 'Solo el visor conserva su material transparente');
        if (!peak || measured.total > peak.measured.total) peak = { avatar, seated, measured };
        if (!peakHead || measured.cabeza + measured.pelo > peakHead.measured.cabeza + peakHead.measured.pelo) {
          peakHead = { avatar, seated, measured };
        }
      }
    }
  }
  const pilot = makePilot(0, peak.avatar, { seated: peak.seated });
  try {
    assert.equal(facesOf(pilot.object).length, peak.measured.total, 'El presupuesto coincide con las mallas fusionadas');
  } finally { release(pilot.object); }
  return { samples, table, peak, peakHead };
}

const result = { source: createHash('sha256').update(source).digest('hex'), coverage: report };
if (report.some(row => Object.keys(modes).some(mode => row[mode].verticesAfuera || row[mode].puntosAfuera))) {
  for (const { nombre, ...row } of report) for (const mode of Object.keys(modes)) {
    if (row[mode].ejemplos.length) console.error(nombre, mode, JSON.stringify(row[mode].ejemplos[0]));
  }
  process.exitCode = 1;
} else if (!process.argv.includes('--solo-cobertura')) {
  result.budget = budget();
  console.table(result.budget.table);
  console.log(JSON.stringify({ total: result.budget.peak.measured, headAndHair: result.budget.peakHead.measured,
    combinations: result.budget.samples }));
}
const destination = process.env.ODISEA_AVATAR_REPORT;
if (destination) {
  await mkdir(dirname(resolve(destination)), { recursive: true });
  await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
}
