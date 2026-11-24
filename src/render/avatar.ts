import * as T from 'three';
import { AVATAR_OPTIONS, cleanAvatar, type Avatar } from '../config.ts';
import { batch, box, cylinder, lamp, metal, piece } from './model.ts';
import type { CabinEffect } from './cabin.ts';

const human = new T.SphereGeometry(1, 12, 8);
const oval = new T.TorusGeometry(1, .095, 5, 16);
const angular = new T.TorusGeometry(1, .095, 5, 4).rotateZ(Math.PI / 4);
const hexagon = new T.TorusGeometry(1, .095, 5, 6).rotateZ(Math.PI / 6);
const torus = new T.TorusGeometry(1, .17, 5, 16);
const star = new T.Shape();
for (let i = 0; i < 10; i++) {
  const angle = i * Math.PI / 5 + Math.PI / 2;
  const radius = i % 2 ? .48 : 1;
  if (i === 0) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
}
star.closePath();
const badgeShape = new T.ShapeGeometry(star);

export const crewSeats = [
  [-1.75, -.42, -1.05],
  [1.75, -.42, -1.05],
  [-2.54, -.4, 2.08],
  [2.54, -.4, 2.08],
] as const;

function coat(parent: T.Group, avatar: Avatar, material: T.Material, trim: T.Material, badge: T.Material) {
  const width = avatar.ropa === 5 ? .42 : avatar.ropa === 4 ? .4 : .354;
  piece(parent, human, material, 0, .18, -.03, width, .43, .216);
  if (avatar.ropa !== 0) piece(parent, human, trim, 0, .43, -.045, .156, .087, .136);
  if (avatar.ropa === 2 || avatar.ropa === 4) piece(parent, box, trim, 0, .165, -.236, .026, .41, .025);
  if (avatar.ropa === 1) piece(parent, human, trim, 0, .095, -.193, .143, .056, .045);
  if (avatar.ropa === 3 || avatar.ropa === 5) piece(parent, box, badge, -.18, .29, -.204, .09, .028, .025);
  if (avatar.ropa === 5) {
    piece(parent, box, trim, 0, .15, -.25, .205, .137, .052);
    piece(parent, box, badge, 0, .17, -.278, .141, .033, .015);
  }
}

function hairModel(parent: T.Group, hair: T.Material, style: number) {
  if (style === 5) {
    piece(parent, human, hair, 0, .141, .024, .209, .116, .183);
    return;
  }
  piece(parent, human, hair, 0, .142, .035, .217, .146, .194);
  if (style === 0 || style === 1) piece(parent, human, hair, -.093, .092, -.12, .136, style ? .125 : .095, .1);
  if (style === 1) piece(parent, human, hair, .083, .064, -.143, .121, .098, .085);
  if (style === 2 || style === 8) {
    for (const side of [-1, 1]) piece(parent, human, hair, side * .171, -.063, .069, .082, style === 2 ? .258 : .193, .133);
    piece(parent, human, hair, 0, -.08, .132, .195, style === 2 ? .25 : .166, .095);
  }
  if (style === 3 || style === 6) {
    const size = style === 6 ? .12 : .079;
    const y = style === 6 ? .15 : .142;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      piece(parent, human, hair, Math.cos(angle) * .173, y + Math.sin(i * .9) * .038, Math.sin(angle) * .144, size, size, size);
    }
    piece(parent, human, hair, 0, style === 6 ? .245 : .195, .016, .128, .099, .138);
  }
  if (style === 4) piece(parent, human, hair, 0, .273, .104, .097, .088, .094);
  if (style === 7) piece(parent, human, hair, .019, -.115, .2, .081, .238, .082).rotation.x = .34;
  if (style === 9) for (let i = 0; i < 5; i++) piece(parent, human, hair, 0, .28 - i * .012, -.12 + i * .06, .054, .107 - i * .011, .05);
}

function faceModel(parent: T.Group, style: Avatar, skin: T.Material, dark: T.Material, hair: T.Material) {
  piece(parent, human, skin, 0, 0, 0, .207, .25, .193);
  piece(parent, human, skin, 0, -.062, -.182, .044, .05, .053);
  for (const side of [-1, 1]) {
    piece(parent, human, skin, side * .196, -.037, -.006, .043, .065, .042);
    piece(parent, human, dark, side * .076, -.012, -.179, .022, style.cara === 2 || style.cara === 3 && side === 1 ? .008 : .027, .012);
    if (style.cara !== 0) {
      const eyebrow = piece(parent, human, hair, side * .077, .047, -.173, .033, .01, .013);
      eyebrow.rotation.z = side * (style.cara === 6 ? .45 : style.cara === 4 ? -.32 : .17);
    }
  }
  const open = style.cara === 1 || style.cara === 4;
  const mouth = piece(parent, human, dark, style.cara === 5 ? .031 : 0, -.125, -.172,
    style.cara === 4 ? .025 : .048, open ? .021 : .009, .012);
  mouth.rotation.z = style.cara === 5 ? -.24 : 0;
  if (style.detalle === 1) {
    for (const side of [-1, 1]) for (let dot = 0; dot < 3; dot++) piece(parent, human, hair, side * (.106 + dot * .016), -.061 - dot % 2 * .013, -.17 + dot * .008, .005, .005, .006);
  }
  if (style.detalle === 2 || style.detalle === 3) piece(parent, human, hair, 0, -.1, -.189, .078, .016, .018);
  if (style.detalle === 3 || style.detalle === 4) piece(parent, human, hair, 0, -.166, -.122, .131, .067, .064);
  if (style.detalle === 5) piece(parent, human, dark, .13, -.091, -.157, .009, .009, .009);
  if (style.detalle === 6) piece(parent, box, lamp('#dda689'), .113, -.086, -.16, .06, .019, .021).rotation.z = -.4;
}

function hat(parent: T.Group, style: number, color: T.Material, trim: T.Material) {
  if (style === 0) return;
  if (style === 1) piece(parent, torus, color, 0, .13, .01, .205, .186, .049).rotation.x = Math.PI / 2;
  if (style === 2) {
    piece(parent, human, color, 0, .194, .02, .229, .11, .225);
    piece(parent, human, color, 0, .158, -.19, .18, .027, .121);
  }
  if (style === 3) {
    piece(parent, human, color, 0, .224, .018, .236, .15, .212);
    piece(parent, human, trim, 0, .358, .018, .054, .055, .052);
  }
  if (style === 4) piece(parent, human, color, -.048, .245, .02, .246, .088, .215).rotation.z = .19;
  if (style === 5) {
    piece(parent, cylinder, color, 0, .289, .02, .168, .217, .16);
    piece(parent, cylinder, color, 0, .185, .02, .246, .031, .222);
    piece(parent, cylinder, trim, 0, .214, .02, .17, .025, .162);
  }
  if (style === 6) {
    const helm = new T.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, 1.38);
    piece(parent, helm, color, 0, .024, .024, .259, .305, .254);
    for (const side of [-1, 1]) piece(parent, human, trim, side * .222, -.028, .035, .061, .102, .088);
    // El casco se cierra después de combinar las piezas en una geometría propia.
    return helm;
  }
  if (style === 7) {
    piece(parent, cylinder, color, 0, .222, .014, .194, .06, .18);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      piece(parent, cylinder, color, Math.cos(angle) * .171, .274, .014 + Math.sin(angle) * .157, .032, .09, .033);
    }
  }
}

function glasses(parent: T.Group, style: number, material: T.Material, dark: T.Material) {
  if (style === 0) return;
  if (style === 10) {
    piece(parent, human, dark, 0, -.014, -.163, .202, .077, .058);
    piece(parent, box, material, 0, .026, -.214, .33, .013, .02);
    return;
  }
  const shape = style === 2 || style === 5 ? angular : style === 7 ? hexagon : oval;
  const width = style === 3 || style === 9 ? .08 : .068;
  const height = style === 3 || style === 6 ? .066 : style === 2 || style === 8 ? .037 : .051;
  for (const side of [-1, 1]) {
    const x = side * .087;
    const lens = piece(parent, shape, material, x, -.01, -.192, width, height, .115);
    lens.rotation.z = style === 4 ? side * .24 : style === 6 ? -side * .15 : 0;
    if (style === 9) piece(parent, human, dark, x, -.01, -.192, .073, .045, .016);
    piece(parent, box, material, side * .161, .006, -.11, .016, .012, .153);
  }
  piece(parent, box, material, 0, .004, -.199, .046, .012, .015);
}

function accessory(head: T.Group, torso: T.Group, style: number, material: T.Material) {
  if (style === 1) for (const side of [-1, 1]) piece(head, oval, material, side * .216, -.093, -.017, .025, .039, .09);
  if (style === 2) {
    const band = piece(head, torus, material, 0, .105, .02, .232, .194, .105);
    band.rotation.x = -.2;
    for (const side of [-1, 1]) piece(head, human, material, side * .212, -.01, .003, .047, .079, .066);
  }
  if (style === 3) {
    for (const side of [-1, 1]) piece(torso, human, material, side * .066, .375, -.189, .071, .033, .03).rotation.z = side * .29;
    piece(torso, human, material, 0, .379, -.205, .031, .032, .026);
  }
  if (style === 4) {
    piece(torso, human, material, 0, .405, -.063, .176, .063, .153);
    piece(torso, box, material, .11, .241, -.194, .079, .294, .025).rotation.z = .14;
  }
  if (style === 5) piece(torso, human, material, 0, .225, -.249, .061, .065, .021);
  if (style === 6) {
    for (const side of [-1, 1]) {
      piece(head, cylinder, material, side * .105, .314, .014, .014, .168, .014).rotation.z = -side * .32;
      piece(head, human, material, side * .134, .398, .014, .028, .028, .028);
    }
  }
  if (style === 7) piece(torso, badgeShape, material, -.16, .275, -.261, .071, .071, .071).rotation.y = Math.PI;
}

export function makePilot(seat: number, raw?: Avatar) {
  const avatar = cleanAvatar(raw);
  const pilot = new T.Group();
  const skin = metal(AVATAR_OPTIONS.piel[avatar.piel], .72, 0);
  const hair = metal(AVATAR_OPTIONS.colorPelo[avatar.colorPelo], .74, 0);
  const suit = metal(AVATAR_OPTIONS.colorRopa[avatar.colorRopa], .72, .03);
  const trim = metal('#172b45', .68, .08);
  const dark = lamp('#20202a');
  const badge = lamp('#79ffba');
  const hatColor = metal(AVATAR_OPTIONS.colorGorro[avatar.colorGorro], .58, .15);
  const glassesColor = metal(AVATAR_OPTIONS.colorLentes[avatar.colorLentes], .42, .37);
  const accessoryColor = metal(AVATAR_OPTIONS.colorAcc[avatar.colorAcc], .48, .25);
  const bodyShape = new T.Group();
  const headShape = new T.Group();
  coat(bodyShape, avatar, suit, trim, badge);
  faceModel(headShape, avatar, skin, dark, hair);
  hairModel(headShape, hair, avatar.pelo);
  const helmet = hat(headShape, avatar.gorro, hatColor, trim);
  glasses(headShape, avatar.lentes, glassesColor, dark);
  accessory(headShape, bodyShape, avatar.acc, accessoryColor);
  const torso = batch(bodyShape);
  const head = batch(headShape);
  helmet?.dispose();
  for (const material of [hatColor, glassesColor, accessoryColor]) {
    if (![...head.children, ...torso.children].some((item) => item instanceof T.Mesh && item.material === material)) material.dispose();
  }
  torso.position.y = .22;
  head.position.set(0, .68, -.06);
  torso.add(head);
  pilot.add(torso);

  const legShape = new T.Group();
  for (const side of [-1, 1]) piece(legShape, human, trim, side * .143, .022, -.16, .137, .131, .314);
  pilot.add(batch(legShape));
  const arms = [-1, 1].map((side) => {
    const shape = new T.Group();
    piece(shape, human, suit, 0, -.172, -.021, .106, .23, .114);
    const forearm = new T.Group();
    forearm.position.y = -.34;
    forearm.rotation.x = .88;
    shape.add(forearm);
    piece(forearm, human, avatar.ropa === 0 || avatar.ropa === 3 ? skin : trim, 0, -.105, 0, .084, .15, .085);
    piece(forearm, human, skin, 0, -.242, -.015, .072, .092, .065);
    const shoulder = batch(shape);
    shoulder.position.set(side * .33, .31, -.013);
    torso.add(shoulder);
    return shoulder;
  });
  const [x, y, z] = crewSeats[seat] ?? crewSeats[0];
  pilot.position.set(x, y, z);
  const direction = seat % 2 ? 1 : -1;
  pilot.rotation.y = direction * .65;
  return {
    object: pilot,
    pose(seconds: number, action: number, reduced: boolean, kind?: CabinEffect['kind']) {
      const amount = Math.sin(Math.PI * action);
      const reach = kind === 'ok' ? amount : 0;
      const recoil = kind === 'error' ? amount : 0;
      const signal = kind === 'help' ? amount : 0;
      const cheer = kind === 'celebrate' ? amount : 0;
      torso.rotation.x = -.1 - reach * .14 + recoil * .43 - cheer * .07;
      torso.rotation.z = (reduced ? 0 : Math.sin(seconds * 1.4 + seat) * .019) + direction * signal * .22;
      head.rotation.y = direction * (.59 + reach * .23 + signal * .35);
      head.rotation.x = reach * .19 - recoil * .31 - cheer * .12;
      arms[0].rotation.set(.25 + recoil * .57 + cheer * 2.54, 0, -.1 - signal * 1.35 - cheer * .35);
      arms[1].rotation.set(.25 + reach * 1.25 + recoil * .47 + cheer * 2.44, 0, .1 + reach * .2 + cheer * .39);
    },
  };
}
