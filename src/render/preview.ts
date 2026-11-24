import * as T from 'three';
import type { Avatar } from '../config.ts';
import { makePilot } from './avatar.ts';
import { release } from './model.ts';

export function mountAvatarPreview(canvas: HTMLCanvasElement, avatar: Avatar, initialZoom = 1.25) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(38, 1, .1, 20);
  const fill = new T.HemisphereLight('#d4e6ff', '#98725d', 2.1);
  const key = new T.DirectionalLight('#e1f6ff', 3.0);
  key.position.set(-3, 5, -4);
  const accent = new T.DirectionalLight('#378bff', 2.0);
  accent.position.set(3, 1.4, 2.1);
  scene.add(fill, key, accent);
  let model: ReturnType<typeof makePilot> | undefined;
  let disposed = false;
  let angle = .44;
  let zoom = initialZoom;
  let framing: 'portrait' | 'body' = 'portrait';

  function draw() {
    if (disposed) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const outfit = framing === 'body';
    const targetY = outfit ? .58 + Math.min(.10, (zoom - 1) * .06) : .77 + Math.min(.18, (zoom - 1) * .15);
    camera.zoom = zoom * (outfit ? .68 : 1);
    camera.position.set(.08, targetY + .012, -(outfit ? 2.15 : 1.97) * Math.max(1, .95 / camera.aspect));
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function update(next: Avatar) {
    if (disposed) return;
    if (model) { scene.remove(model.object); release(model.object); }
    model = makePilot(0, next);
    model.pose(0, 0, true);
    model.object.position.set(0, 0, 0);
    model.object.rotation.y = angle;
    scene.add(model.object);
    draw();
  }

  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  update(avatar);

  return {
    update,
    setZoom(factor: number) {
      zoom = factor;
      draw();
    },
    setView(view: 'portrait' | 'body') {
      if (framing === view) return;
      framing = view;
      draw();
    },
    rotateBy(radians: number) {
      if (!model || disposed) return;
      angle = (angle + radians) % (2 * Math.PI);
      model.object.rotation.y = angle;
      draw();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      release(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
