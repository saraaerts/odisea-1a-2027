import * as T from 'three';
import { CONFIG } from '../config.ts';
import { batch, beam, box, lamp, metal, piece, release } from '../render/model.ts';
import { makeFleet, makeStars } from '../render/space.ts';
import { makeStage, type SpaceStage } from '../render/stages.ts';
import type { BoardSummary } from '../net/session.ts';

export interface Feed {
  host: HTMLElement;
  summary: BoardSummary;
}

const viewTarget = new T.Vector3(0, 2.65, -23);

function compactCabin() {
  const frame = metal('#3a5169', .62, .36);
  const edge = metal('#7591a4', .44, .38);
  const desk = metal('#13253a', .64, .18);
  const glass = lamp('#155372');
  const accent = lamp('#49e3e7');
  const group = new T.Group();
  piece(group, box, desk, 0, .48, -1.9, 7.8, .55, 1.25);
  piece(group, box, edge, 0, .79, -2, 7.85, .08, .13);
  piece(group, box, frame, 0, 3.9, -2.2, 8.1, .33, .44);
  for (const side of [-1, 1]) {
    beam(group, frame, [side * 3.75, .7, -1.8], [side * 2.95, 3.9, -2.2], .3);
    beam(group, edge, [side * 3.61, .75, -1.65], [side * 2.86, 3.92, -2.04], .05);
    piece(group, box, glass, side * 1.42, .88, -1.92, 1.16, .24, .2).rotation.x = -.42;
    piece(group, box, accent, side * 1.42, .93, -1.8, 1.04, .018, .015);
    piece(group, box, frame, side * 2.6, .38, .16, .53, .77, .48);
    piece(group, box, edge, side * 2.6, .75, .3, .55, .045, .27);
  }
  return batch(group);
}

export function mountTelemetry(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'low-power' });
  if (!context) throw new Error('WebGL 2 no está disponible.');
  const renderer = new T.WebGLRenderer({ canvas, context, alpha: true, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setScissorTest(true);
  renderer.setClearColor('#091326', 1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(48, 1, .1, 260);
  camera.position.set(0, 1.9, 3.4);
  const sky = new T.HemisphereLight('#c8edff', '#403947', 2.1);
  const sun = new T.DirectionalLight('#d0e6ff', 2.15);
  const warning = new T.PointLight('#ff5028', 0, 7, 2);
  sun.position.set(-6, 5, 2);
  warning.position.set(1, 1.3, -1);
  const cabin = compactCabin();
  const stars = makeStars();
  const fleet = makeFleet();
  const stages = new Map<number, SpaceStage>();
  scene.add(sky, sun, warning, cabin, stars, fleet.object);
  let lastStage: SpaceStage | undefined;
  let active = true;
  let width = 0;
  let height = 0;

  function draw(feeds: Feed[], reduced: boolean) {
    if (!active) return;
    const bounds = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(bounds.width));
    const h = Math.max(1, Math.round(bounds.height));
    if (width !== w || height !== h) {
      width = w;
      height = h;
      renderer.setSize(width, height, false);
    }
    renderer.setScissorTest(false);
    renderer.setClearAlpha(0);
    renderer.clear();
    renderer.setClearAlpha(1);
    renderer.setScissorTest(true);
    const seconds = reduced ? 0 : performance.now() / 1000;
    for (const { host, summary } of feeds) {
      const area = host.getBoundingClientRect();
      const x = Math.max(0, Math.round(area.left - bounds.left));
      const y = Math.max(0, Math.round(bounds.bottom - area.bottom));
      const viewW = Math.min(width - x, Math.round(area.width));
      const viewH = Math.min(height - y, Math.round(area.height));
      if (viewW < 1 || viewH < 1) continue;
      let stage = stages.get(summary.stage);
      if (!stage) {
        stage = makeStage(CONFIG.etapas[summary.stage].scene);
        stages.set(summary.stage, stage);
        scene.add(stage.object);
      }
      if (lastStage && lastStage !== stage) lastStage.object.visible = false;
      stage.object.visible = true;
      // Misma distancia que usa la cabina, para que la escena no tape la flota.
      stage.object.position.set(viewW / viewH > 2.5 ? -1.6 : 2.1, viewW / viewH > 2.5 ? 6.1 : 3.05, -32);
      lastStage = stage;
      stage.animate(seconds);
      fleet.update(summary.fleet, seconds);
      warning.intensity = summary.broken ? 14 : summary.fires ? 3 + Math.min(5, summary.fires) : 0;
      camera.aspect = viewW / viewH;
      camera.fov = camera.aspect > 2.5 ? 29 : 46;
      camera.lookAt(viewTarget);
      camera.updateProjectionMatrix();
      renderer.setScissor(x, y, viewW, viewH);
      renderer.setViewport(x, y, viewW, viewH);
      renderer.render(scene, camera);
    }
  }

  return {
    draw,
    destroy() {
      if (!active) return;
      active = false;
      release(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
