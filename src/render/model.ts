import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const box = new T.BoxGeometry(1, 1, 1);
export const sphere = new T.SphereGeometry(1, 18, 12);
export const cylinder = new T.CylinderGeometry(1, 1, 1, 16);

export function metal(color: T.ColorRepresentation, roughness = .48, metalness = .58) {
  return new T.MeshStandardMaterial({ color, roughness, metalness });
}

export function lamp(color: T.ColorRepresentation, intensity = 1) {
  return new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), toneMapped: false });
}

export function piece(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material,
  x: number, y: number, z: number, w: number, h: number, d: number) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  parent.add(mesh);
  return mesh;
}

export function beam(parent: T.Object3D, material: T.Material,
  from: [number, number, number], to: [number, number, number], width: number, depth = width) {
  const start = new T.Vector3(...from);
  const end = new T.Vector3(...to);
  const difference = end.clone().sub(start);
  const center = start.addScaledVector(difference, .5);
  const mesh = piece(parent, box, material, center.x, center.y, center.z, width, difference.length(), depth);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), difference.normalize());
  return mesh;
}

export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4_294_967_296;
  };
}

export function batch(source: T.Group, shadow = false) {
  source.updateMatrixWorld(true);
  const materials = new Map<T.Material, T.BufferGeometry[]>();
  source.traverse((object) => {
    if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    if (!materials.has(object.material)) materials.set(object.material, []);
    materials.get(object.material)!.push(geometry);
  });
  const result = new T.Group();
  for (const [material, geometries] of materials) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((item) => item.dispose());
    if (!geometry) continue;
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = shadow;
    result.add(mesh);
  }
  return result;
}

export function release(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  root.traverse((object) => {
    if (!(object instanceof T.Mesh || object instanceof T.Points || object instanceof T.Line)) return;
    if (object.geometry !== box && object.geometry !== sphere && object.geometry !== cylinder) geometries.add(object.geometry);
    const items = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of items) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    }
    if (object instanceof T.InstancedMesh) object.dispose();
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export function makeCockpit() {
  const source = new T.Group();
  const alloy = metal('#738da4', .35, .58);
  const frame = metal('#293c50', .46, .65);
  const panel = metal('#111e32', .62, .38);
  const trim = metal('#192434', .53, .4);
  const glass = lamp('#182d4b');
  const blue = lamp('#49dbe8', 1.1);
  const mint = lamp('#79ffba');
  const amber = lamp('#f2b33d');
  const rng = seeded(2027);
  piece(source, box, panel, 0, -1.14, .42, 12.4, .32, 12.8);
  piece(source, box, frame, 0, -.96, .8, 5.6, .13, 10);
  for (const side of [-1, 1]) {
    const x = side * 3.12;
    piece(source, box, frame, side * 4.8, -.2, 1.65, 2, 1.42, 9.9);
    piece(source, box, trim, side * 4.15, .38, .4, 1.2, .24, 6.8);
    beam(source, alloy, [side * 4.6, -.55, -4.8], [side * 3.25, 3.85, -4.1], .33, .38);
    beam(source, frame, [side * 4.2, -.47, -4.7], [side * 2.95, 3.83, -4.04], .12, .2);
    beam(source, blue, [side * 4.22, .21, -4.52], [side * 3.98, 1.06, -4.38], .032, .06);
    beam(source, frame, [side * 3.25, 3.85, -4.1], [side * 4.9, 2.7, 4.4], .43, .45);
    beam(source, alloy, [side * 4.6, -.6, -4.8], [side * 4.75, -.23, 3.1], .28, .28);
    beam(source, blue, [side * 2.64, -.87, -.75], [side * 2.64, -.87, 4.3], .035, .03);
    for (let i = 0; i < 14; i++) {
      piece(source, box, i % 5 === 0 ? amber : blue, side * 4.18, .52, -2.35 + i * .38, .13, .027, .057);
      piece(source, box, trim, side * 2.43, -.88, -2.35 + i * .46, .39, .029, .17);
    }
    const console = new T.Group();
    console.position.set(side * 2.18, .05, -3.14);
    console.rotation.y = -side * .25;
    console.rotation.x = -.35;
    source.add(console);
    piece(console, box, frame, 0, -.15, 0, 2.85, .67, 1.41);
    piece(console, box, trim, 0, .24, 0, 2.65, .17, 1.21);
    piece(console, box, alloy, 0, .31, -.59, 2.63, .025, .034);
    for (let bank = 0; bank < 2; bank++) {
      const cx = -.65 + bank * 1.3;
      piece(console, box, glass, cx, .337, -.21, 1.08, .02, .48);
      for (let bar = 0; bar < 9; bar++) {
        const length = .03 + rng() * .14;
        piece(console, box, bar % 5 ? blue : mint, cx - .42 + bar * .102, .356, -.24 + length * .3, .031, .015, length);
      }
      piece(console, box, blue, cx, .358, -.405, .77, .015, .013);
      for (let i = 0; i < 5; i++) {
        piece(console, box, i % 4 ? alloy : amber, cx - .37 + i * .176, .362, .28, .085, .04, .1);
      }
    }
    // Los respaldos quedan por debajo de la línea de visión del parabrisas.
    for (const z of [-1.05, 2.08]) {
      const seat = new T.Group();
      seat.position.set(x * (z < 0 ? .56 : .815), 0, z);
      source.add(seat);
      piece(seat, box, frame, 0, -.76, 0, .63, .49, .7);
      piece(seat, box, trim, 0, -.45, 0, .9, .19, .79);
      const back = piece(seat, box, alloy, 0, .01, .35, .78, .93, .14);
      back.rotation.x = -.15;
      piece(seat, box, trim, 0, .03, .43, .54, .8, .16);
      piece(seat, box, blue, 0, .21, .519, .27, .026, .01);
      for (const s of [-1, 1]) piece(seat, box, panel, s * .45, -.14, -.01, .09, .11, .53);
    }
  }
  beam(source, frame, [-3.3, 3.82, -4.08], [3.3, 3.82, -4.08], .42, .36);
  beam(source, alloy, [-3.1, 3.59, -4.04], [3.1, 3.59, -4.04], .06, .13);
  beam(source, blue, [-1.4, 3.57, -3.95], [1.4, 3.57, -3.95], .018, .028);
  piece(source, box, frame, 0, -.64, -3.89, 7.9, .63, 1.05);
  piece(source, box, alloy, 0, -.33, -4.35, 7.7, .045, .05);
  piece(source, box, blue, 0, -.303, -4.32, 4.1, .016, .025);
  return batch(source, true);
}
