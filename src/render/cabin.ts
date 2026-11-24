import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG, type Avatar, type SceneId } from '../config.ts';
import type { CabinFrame, ClassicOptions } from './classic.ts';
import { makePilot } from './avatar.ts';
import { makeEffects } from './effects.ts';
import { makeCockpit, release } from './model.ts';
import { makePost } from './post.ts';
import { makeFleet, makeStars } from './space.ts';
import { makeStage, type SpaceStage } from './stages.ts';

export type VisualQuality = 'high' | 'medium' | 'low';
export type VisualFallback = 'webgl' | 'context' | 'fps';

export interface CabinEffect {
  id: number;
  kind: 'ok' | 'error' | 'help' | 'celebrate';
  seat?: number;
}

export interface Cabin3DFrame extends CabinFrame {
  effect?: CabinEffect;
  crew?: readonly Avatar[];
}

export interface CabinOptions extends ClassicOptions {
  quality?: VisualQuality | 'auto';
  onFallback?: (reason: VisualFallback) => void;
  onQuality?: (quality: VisualQuality) => void;
}

export interface CabinStats {
  quality: VisualQuality;
  fps: number | null;
  frames: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

const qualityForHardware = (): VisualQuality => {
  const cores = navigator.hardwareConcurrency || 4;
  return cores < 4 ? 'low' : 'medium';
};

export function mountCabin(canvas: HTMLCanvasElement, initial: CabinOptions = {}) {
  let renderer: T.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'high-performance' });
  } catch (error) {
    initial.onFallback?.('webgl');
    throw error;
  }

  const scene = new T.Scene();
  scene.background = new T.Color('#040912');
  const camera = new T.PerspectiveCamera(53, 1, .06, 270);
  const cockpit = makeCockpit();
  let stage: { id: SceneId; visual: SpaceStage } | undefined;
  const fleet = makeFleet();
  const effects = makeEffects(fleet.formation);
  const crew: Array<{ key: string; pilot: ReturnType<typeof makePilot> }> = [];
  const stars = makeStars();
  scene.add(stars, fleet.object, cockpit, effects.object);

  const fill = new T.HemisphereLight('#bdd8fe', '#695147', 2.0);
  const key = new T.DirectionalLight('#f9e8d6', 2.7);
  key.position.set(-5, 9, 6);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .2, far: 23 });
  key.shadow.normalBias = .023;
  key.shadow.bias = -.00016;
  key.shadow.radius = 2.4;
  const accent = new T.PointLight('#3a93f2', 12, 10, 2);
  accent.position.set(1.7, 1.1, -2.75);
  const consoleFill = new T.PointLight('#ffdcba', 5.2, 8.5, 2);
  consoleFill.position.set(-1.25, 1.35, -2.65);
  scene.add(fill, key, accent, consoleFill);
  renderer.info.autoReset = false;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  let options = initial;
  let post: ReturnType<typeof makePost> | undefined;
  let reflection: T.WebGLRenderTarget | undefined;
  let quality: VisualQuality = 'medium';
  let width = 0, height = 0;
  let disposed = false, failed = false;
  let effectId: number | undefined;
  let effectStart = -Infinity;
  let firstFrame = -1, windowStart = -1, windowFrames = 0;
  let slowFor = 0, rendered = 0, fps: number | null = null;
  let highSamples = 0;
  let degraded = false;
  let reducedSignature = '';
  const basicMaterials = new Map<T.MeshStandardMaterial, T.MeshLambertMaterial>();
  const materialDefaults = new WeakMap<T.Mesh, T.MeshStandardMaterial>();

  function setMaterials(root: T.Object3D, simple: boolean, disposing = false) {
    const unused = new Set<T.MeshStandardMaterial>();
    root.traverse((object) => {
      if (!(object instanceof T.Mesh) || object.userData.avatarFacetado === true) return;
      const original = materialDefaults.get(object) ?? (object.material instanceof T.MeshStandardMaterial ? object.material : undefined);
      if (!original) return;
      if (simple) {
        let substitute = basicMaterials.get(original);
        if (!substitute) {
          substitute = new T.MeshLambertMaterial({ color: original.color, map: original.map, emissive: original.emissive,
            emissiveIntensity: original.emissiveIntensity, side: original.side, vertexColors: original.vertexColors,
            alphaTest: original.alphaTest, alphaToCoverage: original.alphaToCoverage });
          basicMaterials.set(original, substitute);
        }
        materialDefaults.set(object, original);
        object.material = substitute;
      } else {
        object.material = original;
        if (disposing) unused.add(original);
      }
    });
    for (const original of unused) {
      basicMaterials.get(original)?.dispose();
      basicMaterials.delete(original);
    }
  }

  function removeVisual(object: T.Object3D) {
    scene.remove(object);
    setMaterials(object, false, true);
    release(object);
  }

  function syncCrew(avatars: readonly Avatar[] | undefined) {
    const count = avatars ? Math.min(4, avatars.length) : 1;
    while (crew.length > count) removeVisual(crew.pop()!.pilot.object);
    for (let index = 0; index < count; index++) {
      const avatar = avatars?.[index];
      const seat = avatars ? index : 1;
      const key = `${seat}/${avatar ? JSON.stringify(avatar) : ''}`;
      const current = crew[index];
      if (current?.key === key) continue;
      if (current) removeVisual(current.pilot.object);
      const pilot = makePilot(seat, avatar);
      crew[index] = { key, pilot };
      setMaterials(pilot.object, quality === 'low');
      scene.add(pilot.object);
    }
  }

  function changeQuality(tier: VisualQuality) {
    quality = tier;
    width = height = 0;
    renderer.shadowMap.enabled = tier !== 'low';
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    key.shadow.mapSize.setScalar(tier === 'high' ? 1024 : 512);
    renderer.shadowMap.needsUpdate = true;
    fill.intensity = tier === 'low' ? 2.55 : 2.0;
    accent.visible = tier !== 'low';
    stars.geometry.setDrawRange(0, tier === 'high' ? 2050 : tier === 'medium' ? 1350 : 850);
    if (tier === 'low') { post?.dispose(); post = undefined; }
    else post ??= makePost(renderer);
    if (tier === 'high' && !reflection) {
      const environment = new RoomEnvironment();
      const pmrem = new T.PMREMGenerator(renderer);
      reflection = pmrem.fromScene(environment, .075);
      environment.dispose();
      pmrem.dispose();
    }
    scene.environment = tier === 'high' ? reflection!.texture : null;
    scene.environmentIntensity = .55;
    setMaterials(scene, tier === 'low');
    slowFor = 0;
    options.onQuality?.(tier);
  }

  function fallback(reason: VisualFallback) {
    if (failed || disposed) return;
    failed = true;
    options.onFallback?.(reason);
  }

  function lostContext(event: Event) {
    event.preventDefault();
    fallback('context');
  }
  canvas.addEventListener('webglcontextlost', lostContext);
  function resetSample() {
    firstFrame = windowStart = -1;
    windowFrames = highSamples = slowFor = 0;
  }
  document.addEventListener('visibilitychange', resetSample);

  function sample(now: number) {
    if (document.hidden) return;
    if (firstFrame < 0) { firstFrame = windowStart = now; return; }
    windowFrames++;
    const span = now - windowStart;
    if (span < 1200) return;
    fps = windowFrames * 1000 / span;
    windowStart = now;
    windowFrames = 0;
    if (now - firstFrame < 4000) return;

    slowFor = fps < 24 ? slowFor + span : 0;
    if (options.quality === 'auto' || !options.quality) {
      if (!degraded && fps >= 54 && quality === 'medium' && (navigator.hardwareConcurrency || 0) >= 8) highSamples++;
      else highSamples = 0;
      if (highSamples === 2) changeQuality('high');
      else if (slowFor >= 2400 && quality !== 'low') {
        degraded = true;
        changeQuality(quality === 'high' ? 'medium' : 'low');
      }
    }
    if (slowFor >= 4200) fallback('fps');
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const w = Math.round(bounds.width), h = Math.round(bounds.height);
    if (w < 1 || h < 1) return false;
    if (width === w && height === h) return true;
    width = w;
    height = h;
    const limit = quality === 'high' ? 1.65 : quality === 'medium' ? 1.25 : 1;
    const pixels = quality === 'high' ? 2_250_000 : quality === 'medium' ? 1_300_000 : 920_000;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, limit, Math.sqrt(pixels / (w * h))));
    renderer.setSize(w, h, false);
    if (post) {
      const scale = renderer.getPixelRatio() * (quality === 'medium' ? .79 : 1);
      post.resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    reducedSignature = '';
    return true;
  }

  changeQuality(!options.quality || options.quality === 'auto' ? qualityForHardware() : options.quality);
  return {
    render(frame: Cabin3DFrame, now = performance.now()) {
      if (disposed || failed) return;
      sample(now);
      if (failed || !resize()) return;
      const reduced = options.reduced ?? false;
      const firstPerson = options.view === 'first';
      const signature = `${frame.stage}/${frame.fleet}/${frame.hull}/${frame.fires}/${frame.phase}/${frame.progress}/${frame.effect?.id}/${firstPerson}/${quality}/${reduced ? JSON.stringify(frame.crew) : ''}`;
      if (reduced && reducedSignature === signature) return;
      reducedSignature = reduced ? signature : '';

      const sceneId = CONFIG.etapas[frame.stage]?.scene ?? 'station';
      if (stage?.id !== sceneId) {
        if (stage) removeVisual(stage.visual.object);
        stage = { id: sceneId, visual: makeStage(sceneId) };
        setMaterials(stage.visual.object, quality === 'low');
        scene.add(stage.visual.object);
      }
      syncCrew(frame.crew);
      const result = effects.update(frame, now, quality, reduced, options.intense ?? true, renderer.getPixelRatio());
      const portrait = camera.aspect < .95;
      const letterbox = camera.aspect > 2.15;
      const eyeHeight = firstPerson ? .74 : portrait ? 1.29 : letterbox ? 1.06 : 1.46;
      camera.position.set(firstPerson ? -.21 : .02, eyeHeight, firstPerson ? 1.97 : (portrait ? 7.8 : 5.95));
      camera.position.x += Math.sin(now * .076) * result.hit * .069;
      camera.position.y += Math.cos(now * .059) * result.hit * .054;
      camera.fov = (portrait ? 57 : firstPerson ? 56 : 54) + result.warp * 8;
      const focusHeight = firstPerson ? -.85 : portrait ? .12 : letterbox ? -.27 : .65;
      camera.lookAt(firstPerson ? .15 : .12, focusHeight, -11);
      camera.rotateZ(Math.sin(now * .047) * result.hit * .009);
      camera.updateProjectionMatrix();

      const seconds = reduced ? 0 : now / 1000;
      const progress = Math.max(0, Math.min(1, frame.progress ?? 0));
      const scale = (portrait ? .68 : 1) * (.96 + progress * .18);
      const landscape = stage.visual.object;
      landscape.scale.setScalar(scale);
      landscape.position.set(portrait ? .9 : letterbox ? -1.6 : 2.1, portrait ? 4.7 : letterbox ? 6.1 : 3.05, -32 + result.warp * 4);
      stage.visual.animate(seconds);
      fleet.object.position.set(portrait ? 2.8 : 0, letterbox ? 2.1 : portrait ? .8 : 0, 0);
      fleet.update(frame.fleet, seconds);

      if (frame.effect?.id !== effectId) {
        effectId = frame.effect?.id;
        effectStart = effectId === undefined ? -Infinity : now;
      }
      const animation = reduced ? 0 : Math.max(0, 1 - (now - effectStart) / 720);
      const target = frame.effect?.seat ?? 0;
      crew.forEach(({ pilot }, index) => {
        const affected = frame.effect?.kind === 'celebrate' || target === index;
        pilot.pose(seconds, affected ? animation : 0, reduced, affected ? frame.effect?.kind : undefined);
      });
      renderer.info.reset();
      if (post) post.draw(scene, camera, quality === 'high', seconds, result.hit, result.warp, reduced);
      else renderer.render(scene, camera);
      rendered++;
    },
    configure(patch: CabinOptions) {
      const qualityChanged = patch.quality !== undefined && patch.quality !== options.quality;
      options = { ...options, ...patch };
      reducedSignature = '';
      if (qualityChanged) {
        degraded = false;
        changeQuality(options.quality === 'auto' ? qualityForHardware() : options.quality!);
        resetSample();
      }
    },
    stats(): CabinStats {
      return {
        quality, fps, frames: rendered,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lostContext);
      document.removeEventListener('visibilitychange', resetSample);
      post?.dispose();
      reflection?.dispose();
      key.shadow.dispose();
      setMaterials(scene, false, true);
      release(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
