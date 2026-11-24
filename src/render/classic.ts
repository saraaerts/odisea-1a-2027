import { CONFIG } from '../config.ts';

// Dibujo portado de la cabina Canvas 2D de Odisea.
const hazardSprites = new Map<Scene, HTMLCanvasElement>();
const hullSprites = new Map<boolean, HTMLCanvasElement>();
const circle = Math.PI * 2;
type Scene = typeof CONFIG.etapas[number]['scene'];
const spaceColors: Record<Scene, string> = {
  station: '91,163,217', belt: '133,149,189', hole: '181,88,52', storm: '132,113,206',
  rocks: '155,115,92', nebula: '97,76,193', ringed: '58,154,185', gate: '45,136,231'
};

function spaceRandom(seed: number){
  let n = seed;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) | 0; return (n >>> 0) / 4294967296; };
}

function sceneTexture(w: number, h: number){
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return canvas;
}

function spacePath(c: CanvasRenderingContext2D, points: [number, number][], fill: string | CanvasGradient, stroke?: string){
  c.beginPath(); c.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) c.lineTo(x, y);
  c.closePath();
  if (fill){ c.fillStyle = fill; c.fill(); }
  if (stroke){ c.strokeStyle = stroke; c.stroke(); }
}

function spaceEllipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation: number, fill: string | CanvasGradient){
  c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, circle); c.fill();
}

function spaceGlow(c: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, opacity: number){
  const glow = c.createRadialGradient(x, y, 0, x, y, r);
  glow.addColorStop(0, `rgba(${rgb},${opacity})`);
  glow.addColorStop(.42, `rgba(${rgb},${opacity * .34})`);
  glow.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = glow; c.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawOrbitalField(c: CanvasRenderingContext2D, w: number, h: number, firstPerson: boolean){
  const x = w * (firstPerson ? .54 : .74), y = h * (firstPerson ? .54 : .374);
  const r = Math.min(w * .27, h * .62);
  c.fillStyle = '#283850';
  c.beginPath(); c.arc(x, y, r * .63, 0, circle); c.fill();
  c.strokeStyle = 'rgba(141,159,199,.45)'; c.lineWidth = 1;
  c.beginPath(); c.ellipse(x, y, r * 1.18, r * .26, -.38, 0, circle); c.stroke();
  c.strokeStyle = 'rgba(155,232,242,.28)';
  c.beginPath(); c.arc(x, y, r * .72, -1.27, 1.19); c.stroke();
}

function drawStarfield(canvas: HTMLCanvasElement, kind: Scene, w: number, h: number, editorial = false, firstPerson = false){
  const c = canvas.getContext('2d');
  if (!c) return;
  const rng = spaceRandom(1717);
  c.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  const base = c.createLinearGradient(0, 0, w * .6, h);
  base.addColorStop(0, editorial ? '#101727' : '#030610');
  base.addColorStop(.55, editorial ? '#192841' : '#091429');
  base.addColorStop(1, editorial ? '#101727' : '#030610');
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  const rgb = spaceColors[kind] || spaceColors.station;
  spaceGlow(c, w * .72, h * .28, w * .56, rgb, .15);
  spaceGlow(c, w * .26, h * .52, w * .46, '35,92,163', .12);
  for (let i = 0; i < (editorial ? 96 : 290); i++){
    const x = rng() * w, y = h * (.61 - x / w * .33 + (rng() + rng() - 1) * .6);
    const a = .02 + rng() * .15;
    c.fillStyle = i % 3 ? `rgba(176,206,248,${a})` : `rgba(${rgb},${a})`;
    c.fillRect(x, y, rng() * 1.5 + .35, .8);
  }
  for (let i = 0; i < (editorial ? 72 : 146); i++){
    const x = rng() * w, y = rng() * h, a = rng() * .74 + .14, s = a > .8 ? 1.25 : .75;
    c.fillStyle = i % 7 === 0 ? `rgba(255,215,179,${a})` : `rgba(204,226,255,${a})`;
    c.fillRect(x, y, s, s);
    if (a > .83 && i % 2 === 0){
      spaceGlow(c, x, y, 4, '159,206,255', .36);
      c.fillStyle = 'rgba(200,224,255,.5)'; c.fillRect(x - 2.5, y + .2, 5, .55);
    }
  }
  const vignette = c.createLinearGradient(0, 0, 0, h);
  vignette.addColorStop(0, 'rgba(2,5,12,.66)'); vignette.addColorStop(.24, 'rgba(2,5,12,0)');
  vignette.addColorStop(.68, 'rgba(2,5,12,.12)'); vignette.addColorStop(1, '#02050c');
  c.fillStyle = vignette; c.fillRect(0, 0, w, h);
  if (editorial) drawOrbitalField(c, w, h, firstPerson);
}


function shipShape(c: CanvasRenderingContext2D, x: number, y: number, s: number, lost = false){
  if (!hullSprites.has(lost)){
    const sprite = sceneTexture(80, 50), g = sprite.getContext('2d');
    if (!g) return;
    g.setTransform(21, 0, 0, 21, 41, 25);
    const rgb = lost ? '255,148,49' : '73,227,231';
    spaceGlow(g, -.97, 0, .73, rgb, .69);
    const wake = g.createLinearGradient(-1.8, 0, -.5, 0);
    wake.addColorStop(0, `rgba(${rgb},0)`); wake.addColorStop(1, `rgba(${rgb},.79)`);
    spacePath(g, [[-1.83,.04],[-.62,-.2],[-.62,.2]], wake);
    spacePath(g, [[1.39,.02],[.23,.21],[-.75,.52],[-.85,.36],[-.6,.08],[-.75,-.33],[-.83,-.49],[.25,-.25]], '#26394c');
    spacePath(g, [[.65,-.09],[-.2,-.48],[-.95,-.61],[-.7,-.24],[-.25,-.04]], '#a1b9c8');
    spacePath(g, [[.38,.06],[-.6,.22],[-.88,.57],[-.1,.4],[.66,.13]], '#58728a');
    const alloy = g.createLinearGradient(0, -.47, 0, .34);
    alloy.addColorStop(0, '#edf7ff'); alloy.addColorStop(.42, '#a5bfce'); alloy.addColorStop(.65, '#5a7e94'); alloy.addColorStop(1, '#263b51');
    spacePath(g, [[1.39,-.02],[.43,.2],[-.5,.17],[-.78,.04],[-.68,-.19],[-.24,-.24],[.37,-.21]], alloy);
    spacePath(g, [[.77,-.05],[.13,.04],[-.3,.02],[-.25,-.12],[.31,-.13]], '#0d3146');
    spacePath(g, [[.39,-.09],[.05,-.05],[-.22,-.06]], lost ? '#F2B33D' : '#a7f8f7');
    g.fillStyle = lost ? '#ffd599' : '#79FFBA';
    g.fillRect(-.99,-.57,.16,.12); g.fillRect(-.91,.39,.15,.12); g.fillRect(-.77,-.11,.1,.18);
    hullSprites.set(lost, sprite);
  }
  c.drawImage(hullSprites.get(lost)!, x - s * 1.96, y - s * 1.19, s * 3.81, s * 2.38);
}

function asteroid(c: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, light: boolean){
  const rng = spaceRandom(seed), outline: [number, number][] = [];
  c.save(); c.translate(x, y); c.rotate(rng() * 4); c.scale(r, r * (.65 + rng() * .26));
  for (let i = 0; i < 10; i++){
    const a = i * circle / 10, d = .66 + rng() * .34;
    outline.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  const tones = light ? ['#c1ab98', '#786d6b', '#31313c'] : ['#8b9aa5', '#566375', '#222839'];
  const mineral = c.createLinearGradient(-.61, -.76, .57, .68);
  mineral.addColorStop(0, tones[0]); mineral.addColorStop(.38, tones[1]); mineral.addColorStop(1, tones[2]);
  spacePath(c, outline, mineral); c.clip();
  for (let i = 0; i < 10; i++){
    const p = outline[i], q = outline[(i + 1) % outline.length];
    spacePath(c, [p, q, [(rng() - .5) * .9, (rng() - .5) * .84]], i % 2 ? 'rgba(223,231,239,.11)' : 'rgba(7,11,22,.22)');
  }
  for (let i = 0; i < 9; i++){
    const px = rng() * 1.3 - .65, py = rng() * 1.15 - .58, d = .02 + rng() ** 2 * .15;
    spaceEllipse(c, px, py + .012, d, d * .6, .1, 'rgba(231,216,192,.17)');
    spaceEllipse(c, px, py, d * .88, d * .54, .1, 'rgba(11,17,26,.46)');
  }
  c.restore();
}

function stationStructure(c: CanvasRenderingContext2D, gate: boolean){
  c.save(); c.rotate(gate ? -.24 : -.4); c.scale(1, gate ? .88 : .71);
  const metal = c.createLinearGradient(-.62, -.84, .63, .69);
  metal.addColorStop(0, '#b8cbd5'); metal.addColorStop(.25, '#435b72'); metal.addColorStop(.5, '#253749');
  metal.addColorStop(.77, '#7899aa'); metal.addColorStop(1, '#172b40');
  const r = gate ? .94 : .84;
  if (gate){
    spaceGlow(c, 0, 0, 1.36, '24,130,255', .83);
    const iris = c.createRadialGradient(-.13, -.1, 0, 0, 0, .84);
    iris.addColorStop(0, '#070d37'); iris.addColorStop(.52, '#132d6d'); iris.addColorStop(.84, '#2774cc'); iris.addColorStop(1, '#9beefa');
    spaceEllipse(c, 0, 0, .85, .85, 0, iris);
    for (let i = 0; i < 10; i++){
      c.strokeStyle = `rgba(130,226,250,${.10 + i * .032})`; c.lineWidth = .011;
      c.beginPath(); c.ellipse(-.08, -.01, .19 + i * .069, .11 + i * .072, -.4, i * .72, i * .72 + 2.1); c.stroke();
    }
  } else {
    c.lineWidth = .055;
    for (let i = 0; i < 8; i++){
      c.save(); c.rotate(i * circle / 8 + .15);
      spacePath(c, [[.11,-.04],[.84,-.075],[.87,.04],[.11,.063]], metal, '#243747');
      c.fillStyle = '#19344f'; c.fillRect(.44, -.035, .32, .064);
      c.fillStyle = '#6d9db3'; c.fillRect(.45, -.022, .29, .013);
      c.restore();
    }
  }
  c.lineWidth = .19; c.strokeStyle = '#101e30'; c.beginPath(); c.arc(.055, .109, r, 0, circle); c.stroke();
  c.strokeStyle = metal; c.beginPath(); c.arc(0, 0, r, 0, circle); c.stroke();
  c.strokeStyle = gate ? '#a5f2ff' : '#abc7d5'; c.lineWidth = .022;
  c.beginPath(); c.arc(0, 0, r - .078, 0, circle); c.stroke();
  for (let i = 0; i < 16; i++){
    c.save(); c.rotate(i * circle / 16);
    c.lineWidth = .009;
    spacePath(c, [[r-.074,-.069],[r+.055,-.076],[r+.089,-.03],[r+.085,.055],[r-.052,.07]], i % 2 ? '#314960' : metal, '#152738');
    c.fillStyle = i % 4 === 0 ? '#F2B33D' : '#9ae9f5'; c.fillRect(r - .03, -.031, .071, .015);
    c.fillStyle = '#172a3f'; c.fillRect(r - .021, .005, .052, .022);
    c.restore();
  }
  if (gate){
    for (const side of [-1, 1]){
      c.save(); c.rotate(side * .92);
      spacePath(c, [[.96,-.15],[1.22,-.11],[1.38,-.055],[1.38,.055],[1.16,.12],[.98,.16]], metal);
      c.fillStyle = '#9df4f8'; c.fillRect(1.20, -.034, .11, .02); c.restore();
    }
  } else {
    spacePath(c, [[-1.37,.028],[-.63,-.082],[.74,-.06],[1.36,.04],[1.36,.143],[.63,.13],[-.72,.16],[-1.36,.118]], metal);
    for (const side of [-1, 1]){
      c.save(); c.scale(side, 1);
      c.fillStyle = '#5c788c'; c.fillRect(.97, -.2, .37, .4);
      for (let column = 0; column < 4; column++){
        for (let row = 0; row < 5; row++){
          c.fillStyle = (column + row) % 2 ? '#213b65' : '#28466b';
          c.fillRect(.994 + column * .081, -.177 + row * .073, .072, .06);
        }
      }
      c.restore();
    }
    spaceEllipse(c, 0, 0, .286, .214, 0, '#203447'); spaceEllipse(c, -.04, -.04, .23, .17, 0, metal);
    spaceEllipse(c, -.075, -.059, .118, .075, 0, '#153a56'); spaceEllipse(c, -.087, -.089, .06, .015, 0, '#b9f0f4');
  }
  c.restore();
}

function orbitRing(c: CanvasRenderingContext2D, radius: number, height: number, start: number, end: number, color: string, width: number){
  c.strokeStyle = color; c.lineWidth = width;
  c.beginPath(); c.ellipse(0, 0, radius, height, 0, start, end); c.stroke();
}

function ringedWorld(c: CanvasRenderingContext2D, hole: boolean){
  const colors = hole ? ['#712e39', '#db663e', '#fac181', '#fff1ba'] : ['#426785', '#7f99ab', '#b4c2c4', '#d0c6ae'];
  const rng = spaceRandom(hole ? 373 : 127);
  const bands = Array.from({ length: 20 }, (_, i) => ({ r: .76 + i * .036, h: .16 + i * .012, color: colors[Math.floor(rng() * colors.length)], a: .2 + rng() * .57 }));
  c.save(); c.rotate(hole ? -.39 : -.49);
  for (const b of bands){ c.globalAlpha = b.a; orbitRing(c, b.r, b.h, Math.PI, circle, b.color, hole ? .051 : .022); }
  c.globalAlpha = 1; c.restore();
  if (hole){
    const lens = c.createRadialGradient(-.03, 0, .4, 0, 0, .97);
    lens.addColorStop(.19, '#05040b'); lens.addColorStop(.35, '#ffe2a3'); lens.addColorStop(.43, '#c56d42');
    lens.addColorStop(.54, 'rgba(184,69,51,.42)'); lens.addColorStop(1, 'rgba(172,63,60,0)');
    spaceEllipse(c, 0, -.07, .97, .97, 0, lens);
    spaceEllipse(c, 0, 0, .548, .548, 0, '#010207');
    c.save(); c.rotate(-.17); orbitRing(c, .57, .57, 3.24, 5.84, '#ffe3ab', .016); c.restore();
  } else {
    const r = .73;
    const gas = c.createRadialGradient(-.34, -.38, .02, .06, .08, .91);
    gas.addColorStop(0, '#b5e3e0'); gas.addColorStop(.34, '#609fad'); gas.addColorStop(.66, '#274f6d'); gas.addColorStop(1, '#0b1629');
    c.save(); spaceEllipse(c, 0, 0, r, r, 0, gas); c.clip();
    c.rotate(-.37);
    for (let i = 0; i < 27; i++){
      const y = -.69 + i * .054;
      c.strokeStyle = i % 3 ? `rgba(134,211,221,${rng() * .24})` : 'rgba(226,204,182,.33)';
      c.lineWidth = .012 + rng() * .04;
      c.beginPath(); c.moveTo(-.81, y); c.quadraticCurveTo(-.06, y + .22 - Math.abs(y) * .24, .81, y - .045); c.stroke();
    }
    c.restore();
    const night = c.createLinearGradient(-.48, -.56, .48, .56);
    night.addColorStop(.28, 'rgba(4,9,20,0)'); night.addColorStop(1, 'rgba(4,9,20,.86)');
    spaceEllipse(c, 0, 0, r, r, 0, night);
  }
  c.save(); c.rotate(hole ? -.39 : -.49);
  for (const b of bands){ c.globalAlpha = b.a; orbitRing(c, b.r, b.h, 0, Math.PI, b.color, hole ? .05 : .025); }
  c.globalAlpha = 1; c.restore();
}

function floatingSheet(c: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number){
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(size, size);
  spacePath(c, [[-.53,-.73],[.43,-.69],[.52,.46],[.21,.75],[-.6,.67]], '#c3d2de');
  spacePath(c, [[.21,.75],[.22,.43],[.52,.46]], '#718aa0');
  c.fillStyle = '#55718b'; c.fillRect(-.39,-.46,.62,.078); c.fillRect(-.39,-.23,.54,.063); c.fillRect(-.39,-.04,.64,.063);
  c.restore();
}

function gasCloud(c: CanvasRenderingContext2D, storm: boolean){
  const rng = spaceRandom(storm ? 920 : 835);
  const colors = storm ? ['94,99,179', '66,95,169', '131,119,200'] : ['170,77,151', '57,117,233', '88,218,214'];
  for (let i = 0; i < 68; i++){
    const x = (rng() - .5) * 2.38, y = Math.sin(x * 2.1) * -.31 + (rng() - .5) * .62;
    const size = .12 + rng() * .47;
    spaceGlow(c, x, y, size, colors[i % 3], .14 + rng() * .29);
  }
  for (let i = 0; i < 74; i++){
    const x = (rng() - .5) * 2.67, y = (rng() - .5) * 1.48;
    c.fillStyle = `rgba(216,237,255,${rng() * .51 + .08})`; c.fillRect(x, y, .012, .012);
  }
  if (storm){
    const bolts: [number, number][][] = [[[-.98,.19],[-.56,.08],[-.39,.17],[-.04,-.15],[.16,-.13],[.46,-.44]],
      [[.15,.49],[.36,.27],[.48,.32],[.68,.06],[1.02,-.08]], [[-.39,.17],[-.29,.34],[-.08,.4]]];
    for (const points of bolts){
      c.beginPath(); c.moveTo(...points[0]); for (const p of points.slice(1)) c.lineTo(...p);
      c.strokeStyle = 'rgba(153,173,255,.46)'; c.lineWidth = .063; c.stroke();
      c.strokeStyle = '#d6e4ff'; c.lineWidth = .014; c.stroke();
    }
    floatingSheet(c, -.75, -.45, .18, -.66); floatingSheet(c, .38, .49, .235, .45); floatingSheet(c, 1.01, -.36, .145, 1.03);
  }
}

function asteroidField(c: CanvasRenderingContext2D, belt: boolean){
  const rng = spaceRandom(belt ? 172 : 802);
  if (belt){
    const planet = c.createRadialGradient(-.24, -.21, .02, 0, 0, .49);
    planet.addColorStop(0, '#748b9f'); planet.addColorStop(.52, '#31465f'); planet.addColorStop(1, '#131d2f');
    spaceEllipse(c, 0, 0, .45, .45, 0, planet);
    for (let i = 0; i < 52; i++){
      const x = (rng() - .5) * 2.95, y = x * -.28 + (rng() - .5) * .6;
      asteroid(c, x, y, .021 + rng() ** 2 * .105, i * 1e4 + 67, i % 5 === 0);
    }
  } else {
    for (let i = 0; i < 27; i++){
      const x = (rng() - .5) * 2.9, y = (rng() - .5) * 1.59;
      asteroid(c, x, y, .022 + rng() * .072, i * 1e4 + 31, true);
    }
    asteroid(c, -.74, -.28, .3, 498314, true); asteroid(c, .86, -.39, .28, 78231, false);
    asteroid(c, .15, .3, .57, 83921, true); asteroid(c, -.99, .62, .19, 582951, false);
    asteroid(c, 1.06, .48, .22, 79123, true);
  }
}

function drawHazard(c: CanvasRenderingContext2D, kind: Scene, x: number, y: number, r: number, t: number){
  if (!hazardSprites.has(kind)){
    const sprite = sceneTexture(384, 276), g = sprite.getContext('2d');
    if (!g) return;
    g.setTransform(111, 0, 0, 111, 192, 138);
    const tone = spaceColors[kind] || spaceColors.station;
    spaceGlow(g, 0, 0, 1.35, tone, .26);
    if (kind === 'station' || kind === 'gate') stationStructure(g, kind === 'gate');
    if (kind === 'belt' || kind === 'rocks') asteroidField(g, kind === 'belt');
    if (kind === 'hole' || kind === 'ringed') ringedWorld(g, kind === 'hole');
    if (kind === 'storm' || kind === 'nebula') gasCloud(g, kind === 'storm');
    hazardSprites.set(kind, sprite);
  }
  const sway = Math.sin(t * .79);
  c.save();
  c.translate(x + sway * r * .021, y + Math.sin(t * .61) * r * .025);
  c.rotate(kind === 'station' ? t * .16 : sway * (kind === 'gate' ? .065 : .027));
  c.drawImage(hazardSprites.get(kind)!, -r * 1.73, -r * 1.24, r * 3.46, r * 2.48);
  c.restore();
}


function drawFlightStreaks(c: CanvasRenderingContext2D, w: number, h: number, now: number){
  const cx = w * .54, cy = h * .54;
  c.strokeStyle = 'rgba(172,214,255,.28)';
  c.lineWidth = .85;
  c.beginPath();
  for (let i = 0; i < 28; i++){
    const angle = i * 2.4, depth = ((now * .00011 + i * .271) % 1) ** 2;
    const dx = Math.cos(angle) * w * .63, dy = Math.sin(angle) * h * .72;
    const tail = depth * .94;
    c.moveTo(cx + dx * tail, cy + dy * tail);
    c.lineTo(cx + dx * depth, cy + dy * depth);
  }
  c.stroke();
}

function flightApproach(anim: { approach?: { stage: number; progress: number; time: number } }, stage: number, progress: number, now: number, reduced: boolean){
  if (reduced) return .85;
  if (anim.approach?.stage !== stage || now - anim.approach.time > 500){
    anim.approach = { stage, progress, time: now };
  }
  const approach = anim.approach;
  approach.progress += (progress - approach.progress) * (1 - Math.exp((approach.time - now) / 340));
  approach.time = now;
  return .62 + approach.progress * .58;
}

export interface CabinFrame {
  stage: number;
  fleet: number;
  hull: number;
  fires: number;
  progress?: number;
  phase?: 'lobby' | 'play' | 'between' | 'end';
}

export interface ClassicOptions {
  reduced?: boolean;
  intense?: boolean;
  view?: 'first' | 'fixed';
  compact?: boolean;
}

export interface ClassicCabin {
  render(frame: CabinFrame, now?: number): void;
  configure(options: ClassicOptions): void;
  destroy(): void;
}

interface FlightAnimation {
  fleet?: number;
  approach?: { stage: number; progress: number; time: number };
  lost: { index: number; start: number }[];
}

const fleetFormation = Array.from({ length: CONFIG.naves }, (_, i) => ({
  column: i % 10,
  row: Math.floor(i / 10),
  phase: i * 2.4,
}));

function drawFleet(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, now: number, count: number,
  animation: FlightAnimation,
  destination: { x: number; y: number },
  firstPerson: boolean, reduced: boolean,
) {
  const t = reduced ? 0 : now / 1000;
  const movement = reduced ? 0 : 1.2;
  const size = Math.max(2.8, Math.min(8.4, w * .0126, h * .031));
  const position = (index: number) => {
    const { column, row, phase } = fleetFormation[index];
    return {
      x: w * ((firstPerson ? .17 : .116) + column * (firstPerson ? .025 : .042) + row * .017)
        + Math.sin(t * 1.27 + phase) * movement,
      y: h * ((firstPerson ? .53 : .238) + row * (firstPerson ? .071 : .103) - column * .0042)
        + Math.cos(t * .96 + phase) * movement,
    };
  };

  if (animation.fleet === undefined || count > animation.fleet || reduced) {
    animation.lost = [];
  } else if (count < animation.fleet) {
    for (let index = animation.fleet - 1; index >= count; index--) {
      animation.lost.push({ index, start: now + Math.min(8, animation.lost.length) * 75 });
    }
  }
  animation.fleet = count;

  for (let i = 0; i < count; i++) {
    const { x, y } = position(i);
    shipShape(ctx, x, y, size * (.78 + fleetFormation[i].row * .086));
  }

  animation.lost = animation.lost.filter(({ start }) => now - start < 1200);
  for (const { index, start } of animation.lost) {
    const { x, y } = position(index);
    const progress = Math.max(0, (now - start) / 1200);
    const travel = progress * progress;
    ctx.save();
    ctx.translate(x + (destination.x - x) * travel, y + (destination.y - y) * travel);
    ctx.rotate(progress * 3.75);
    ctx.globalAlpha = 1 - progress;
    shipShape(ctx, 0, 0, size * (1 - progress * .76), true);
    if (progress < .35) spaceGlow(ctx, 0, 0, size * (.6 + progress * 5), '255,156,63', progress * 1.7);
    ctx.restore();
  }
}

function drawCockpit(ctx: CanvasRenderingContext2D, w: number, h: number, firstPerson: boolean) {
  const edge = ctx.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, '#030711');
  edge.addColorStop(.47, '#1b2d40');
  edge.addColorStop(1, '#071220');
  spacePath(ctx, [[0, 0], [w, 0], [w, h * .08], [w * .68, h * .055], [w * .32, h * .055], [0, h * .08]], edge, '#253e54');
  spacePath(ctx, [[0, h * .05], [w * .025, h * .05], [w * .115, h * .73], [w * .06, h * .83], [0, h * .65]], edge, '#37516a');
  spacePath(ctx, [[w, h * .05], [w * .975, h * .05], [w * .885, h * .73], [w * .94, h * .83], [w, h * .65]], edge, '#37516a');

  const consoleHeight = h * (firstPerson ? .88 : .75);
  const consoleMetal = ctx.createLinearGradient(0, consoleHeight, 0, h);
  consoleMetal.addColorStop(0, '#27455a');
  consoleMetal.addColorStop(.26, '#111e2e');
  consoleMetal.addColorStop(1, '#060c19');
  spacePath(ctx, [[0, h * .86], [w * .19, consoleHeight], [w * .81, consoleHeight], [w, h * .86], [w, h], [0, h]], consoleMetal, '#34556c');
  ctx.fillStyle = '#49e3e7a0';
  ctx.fillRect(w * .32, consoleHeight + 5, w * .36, 1);
  ctx.fillStyle = '#4a6f8e';
  for (let i = 0; i < 12; i++) ctx.fillRect(w * (.29 + i * .037), consoleHeight + 11, Math.max(2, w * .021), 2);

  if (firstPerson) return;
  for (const seat of [w * .22, w * .75]) {
    spacePath(ctx, [[seat - w * .07, h], [seat - w * .054, h * .86], [seat - w * .027, h * .84],
      [seat + w * .031, h * .84], [seat + w * .06, h * .88], [seat + w * .075, h]], edge, '#37536c');
  }
}

function drawDamage(ctx: CanvasRenderingContext2D, w: number, h: number, frame: CabinFrame, t: number, intense: boolean) {
  if (frame.hull < 60) {
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * .2, w / 2, h / 2, Math.hypot(w, h) * .53);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, `rgba(190,45,23,${Math.min(.45, (60 - frame.hull) * .007)})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
  if (!intense) return;
  const fires = Math.max(0, Math.min(12, Math.trunc(frame.fires)));
  for (let i = 0; i < fires; i++) {
    const x = w * (.09 + i % 6 * .164);
    const y = h * (.87 - Math.floor(i / 6) * .22);
    const r = Math.min(w * .027, h * .068) * (1 + Math.sin(t * 8 + i * 1.7) * .09);
    spaceGlow(ctx, x, y, r * 2.25, '232,87,29', .62);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r, r);
    const flame = ctx.createLinearGradient(0, -1.5, 0, .5);
    flame.addColorStop(0, '#e4572e25');
    flame.addColorStop(.52, '#ec652e');
    flame.addColorStop(1, '#f2b33d');
    ctx.beginPath();
    ctx.moveTo(-.67, .25);
    ctx.bezierCurveTo(-1, -.48, -.15, -.67, -.21, -1.46);
    ctx.bezierCurveTo(.54, -1.12, .34, -.55, .62, -.61);
    ctx.bezierCurveTo(1.1, .09, .58, .61, 0, .61);
    ctx.closePath();
    ctx.fillStyle = flame;
    ctx.fill();
    spaceEllipse(ctx, 0, .22, .23, .35, .15, '#ffe1a7');
    ctx.restore();
  }
}

export function mountClassic(canvas: HTMLCanvasElement, initial: ClassicOptions = {}): ClassicCabin {
  const ctx = canvas.getContext('2d', { alpha: false });
  const animation: FlightAnimation = { lost: [] };
  let options = initial;
  let lastFrame = -Infinity;
  let signature = '';
  let background: { canvas: HTMLCanvasElement; key: string } | undefined;
  let disposed = false;

  return {
    render(frame, now = performance.now()) {
      if (!ctx || disposed) return;
      const { compact = false, intense = true, reduced = false, view = 'fixed' } = options;
      const interval = reduced ? 100 : compact ? 42 : 31;
      if (now - lastFrame < interval) return;
      lastFrame = now;

      const { width: w, height: h } = canvas.getBoundingClientRect();
      if (w < 1 || h < 1) return;
      const dpr = Math.min(globalThis.devicePixelRatio || 1, compact ? 1 : 1.35, Math.sqrt(1_400_000 / (w * h)));
      const width = Math.max(1, Math.round(w * dpr));
      const height = Math.max(1, Math.round(h * dpr));
      const firstPerson = view === 'first';
      const kind = CONFIG.etapas[frame.stage]?.scene ?? 'station';
      const count = Math.max(0, Math.min(CONFIG.naves, Math.trunc(frame.fleet)));
      const progress = Math.max(0, Math.min(1, frame.progress ?? (frame.phase === 'between' ? 0 : 1)));
      const key = `${width}/${height}/${kind}/${firstPerson}/${compact}`;
      const nextSignature = `${key}/${count}/${progress}/${frame.hull}/${frame.fires}/${intense}`;
      if (reduced && signature === nextSignature) return;
      signature = reduced ? nextSignature : '';

      if (width !== canvas.width || height !== canvas.height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (background?.key !== key) {
        const texture = sceneTexture(Math.min(640, width), Math.min(400, height));
        drawStarfield(texture, kind, w, h, !compact, firstPerson);
        background = { canvas: texture, key };
      }

      ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
      ctx.drawImage(background.canvas, 0, 0, w, h);
      if (!reduced) drawFlightStreaks(ctx, w, h, now);
      const destination = { x: w * (firstPerson ? .54 : .74), y: h * (firstPerson ? .54 : .374) };
      const radius = firstPerson
        ? Math.min(w * .19, h * .39) * flightApproach(animation, frame.stage, progress, now, reduced)
        : Math.min(w * .157, h * .3) * (.89 + progress * .16);
      drawHazard(ctx, kind, destination.x, destination.y, radius, reduced ? 0 : now / 1000);
      drawFleet(ctx, w, h, now, count, animation, destination, firstPerson, reduced);
      drawCockpit(ctx, w, h, firstPerson);
      drawDamage(ctx, w, h, frame, reduced ? 0 : now / 1000, intense);
    },
    configure(patch) {
      options = { ...options, ...patch };
      signature = '';
    },
    destroy() {
      disposed = true;
      background = undefined;
      animation.lost = [];
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}

