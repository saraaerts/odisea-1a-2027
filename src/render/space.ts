import * as T from 'three';
import { CONFIG } from '../config.ts';
import { batch, beam, box, cylinder, lamp, metal, piece, seeded, sphere } from './model.ts';

export function makeStars() {
  const random = seeded(180127);
  const positions: number[] = [];
  const colors: number[] = [];
  const tint = new T.Color();
  for (let index = 0; index < 2050; index++) {
    const azimuth = random() * Math.PI * 2;
    const vertical = random() * 1.9 - .95;
    const radius = 135 + random() * 110;
    const horizontal = Math.sqrt(1 - vertical * vertical);
    positions.push(Math.cos(azimuth) * radius * horizontal, vertical * radius, Math.sin(azimuth) * radius * horizontal);
    const brightness = .22 + random() ** 3 * .88;
    tint.set(index % 8 === 0 ? '#ffdab7' : '#bcdafa').multiplyScalar(brightness);
    colors.push(tint.r, tint.g, tint.b);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  return new T.Points(geometry, new T.PointsMaterial({ size: 1.35, sizeAttenuation: false, vertexColors: true, toneMapped: false }));
}

export function makeStation() {
  const source = new T.Group();
  const aluminum = metal('#a6b8c7', .39, .48);
  const rib = metal('#405873', .53, .56);
  const dark = metal('#263745', .54, .55);
  const cell = metal('#164579', .27, .5);
  const blue = lamp('#79ecfa');
  const amber = lamp('#f2b33d');
  const rim = new T.TorusGeometry(5, .19, 7, 72);
  const narrowRim = new T.TorusGeometry(4.73, .04, 5, 72);
  piece(source, rim, aluminum, 0, 0, .35, 1, 1, 1);
  piece(source, rim, rib, 0, 0, -.34, 1, 1, 1);
  piece(source, narrowRim, blue, 0, 0, .51, 1, 1, 1);
  for (let i = 0; i < 16; i++) {
    const section = new T.Group();
    section.rotation.z = i * Math.PI / 8;
    source.add(section);
    piece(section, box, i % 2 ? aluminum : rib, 0, 5, 0, 1.31, .45, 1.16);
    piece(section, box, dark, 0, 5.1, .57, .93, .19, .12);
    piece(section, box, i % 4 === 0 ? amber : blue, 0, 5.08, .65, .6, .048, .055);
    if (i % 2 === 0) {
      beam(section, rib, [0, .87, 0], [0, 4.85, 0], .19, .38);
      beam(section, aluminum, [0, .92, .26], [0, 4.83, .29], .049, .05);
    }
  }
  const hub = piece(source, cylinder, aluminum, 0, 0, .2, 1.04, 2.2, 1.04);
  hub.rotation.x = Math.PI / 2;
  piece(source, sphere, dark, 0, 0, 1.27, .7, .7, .35);
  piece(source, sphere, cell, 0, 0, 1.48, .51, .51, .23);
  piece(source, box, blue, 0, 0, 1.72, .6, .06, .035);
  for (const side of [-1, 1]) {
    beam(source, aluminum, [side * .73, 0, 0], [side * 7.5, 0, 0], .29, .23);
    for (let column = 0; column < 8; column++) {
      for (let row = 0; row < 5; row++) {
        const x = side * (5.17 + column * .26);
        piece(source, box, (row + column) % 3 ? cell : rib, x, (row - 2) * .24, .19, .245, .22, .075);
      }
    }
    piece(source, box, blue, side * 7.2, 0, .25, .09, .92, .055);
  }
  const station = batch(source);
  rim.dispose();
  narrowRim.dispose();
  station.position.set(1.6, 3.25, -32);
  station.rotation.set(.48, -.48, -.26);
  return station;
}

export function makeFleet() {
  const source = new T.Group();
  const hull = metal('#9fbed2', .38, .43);
  const engine = lamp('#64e7ef');
  const canopy = metal('#155778', .19, .35);
  const silhouette = new T.Shape();
  silhouette.moveTo(0, 1.27);
  silhouette.lineTo(-.36, .24);
  silhouette.lineTo(-.94, -.52);
  silhouette.lineTo(-.84, -.78);
  silhouette.lineTo(-.31, -.61);
  silhouette.lineTo(0, -.73);
  silhouette.lineTo(.31, -.61);
  silhouette.lineTo(.84, -.78);
  silhouette.lineTo(.94, -.52);
  silhouette.lineTo(.36, .24);
  silhouette.closePath();
  const wing = new T.ExtrudeGeometry(silhouette, { depth: .12, bevelEnabled: false });
  wing.rotateX(-Math.PI / 2);
  const hullMesh = new T.InstancedMesh(wing, hull, CONFIG.naves);
  const glass = new T.InstancedMesh(sphere, canopy, CONFIG.naves);
  const exhaust = new T.InstancedMesh(box, engine, CONFIG.naves);
  const random = seeded(401027);
  const dummy = new T.Object3D();
  const formation = Array.from({ length: CONFIG.naves }, (_, i) => {
    const column = i % 10;
    const row = Math.floor(i / 10);
    return {
      x: -7.7 + column * .76 + row * .23,
      y: 2.25 - row * .61 + column * .026,
      z: -16 - row * 1.4 - column * .43 + random() * .5,
      phase: random() * Math.PI * 2,
    };
  });
  const meshes = [hullMesh, glass, exhaust];
  for (const item of meshes) { item.frustumCulled = false; source.add(item); }
  function update(count: number, seconds: number) {
    const n = Math.max(0, Math.min(CONFIG.naves, Math.trunc(count)));
    for (const item of meshes) item.count = n;
    for (let index = 0; index < n; index++) {
      const { x, y, z, phase } = formation[index];
      const float = Math.sin(seconds * 1.35 + phase) * .04;
      dummy.position.set(x, y + float, z);
      dummy.rotation.set(.16, .42, -.17);
      dummy.scale.setScalar(.25);
      dummy.updateMatrix();
      hullMesh.setMatrixAt(index, dummy.matrix);
      dummy.position.set(x + .01, y + float + .06, z - .055);
      dummy.scale.set(.048, .042, .117);
      dummy.updateMatrix();
      glass.setMatrixAt(index, dummy.matrix);
      dummy.position.set(x + .037, y + float + .028, z + .16);
      dummy.scale.set(.12, .027, .045);
      dummy.updateMatrix();
      exhaust.setMatrixAt(index, dummy.matrix);
    }
    for (const item of meshes) item.instanceMatrix.needsUpdate = true;
  }
  update(CONFIG.naves, 0);
  return { object: source, update, formation };
}
