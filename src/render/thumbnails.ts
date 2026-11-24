import * as T from 'three';
import type { Avatar } from '../config.ts';
import { makePilot } from './avatar.ts';
import { release } from './model.ts';

export function createAvatarThumbnails() {
  const canvas = document.createElement('canvas');
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setSize(160, 160, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;

  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-.39, .39, .39, -.39, .1, 10);
  const fill = new T.HemisphereLight('#d4e6ff', '#98725d', 2.1);
  const key = new T.DirectionalLight('#e1f6ff', 3.0);
  key.position.set(-3, 5, -4);
  const accent = new T.DirectionalLight('#378bff', 2.0);
  accent.position.set(3, 1.4, 2.1);
  scene.add(fill, key, accent);
  let disposed = false;

  return {
    render(avatar: Avatar, crop: 'head' | 'body') {
      if (disposed) throw new Error('El generador de miniaturas ya está cerrado.');
      const halfHeight = crop === 'head' ? .39 : .70;
      const targetY = crop === 'head' ? .94 : .63;
      camera.left = camera.bottom = -halfHeight;
      camera.right = camera.top = halfHeight;
      camera.position.set(.06, targetY + .012, -2.4);
      camera.lookAt(0, targetY, 0);
      camera.updateProjectionMatrix();

      const pilot = makePilot(0, avatar);
      pilot.pose(0, 0, true);
      pilot.object.position.set(0, 0, 0);
      pilot.object.rotation.y = .44;
      scene.add(pilot.object);
      try {
        renderer.render(scene, camera);
        return canvas.toDataURL('image/webp', .82);
      } finally {
        scene.remove(pilot.object);
        release(pilot.object);
      }
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.width = canvas.height = 0;
    },
  };
}
