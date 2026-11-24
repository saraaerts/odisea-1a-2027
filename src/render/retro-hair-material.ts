import * as T from 'three';
import { gunzipSync } from "three/addons/libs/fflate.module.js";
import { fiberLuma } from "./retro-hair-texture.ts";

const tileWidth = 512;
const tileHeight = 256;
let detailedPixels: Uint8Array | undefined;
let distantPixels: Uint8Array | undefined;

function fiberPixels() {
  const luma = gunzipSync(Uint8Array.from(atob(fiberLuma), char => char.charCodeAt(0)));
  const pixels = new Uint8Array(luma.length * 4);
  for (let i = 0; i < luma.length; i++) {
    const value = luma[i];
    const offset = i * 4;
    pixels[offset] = value;
    pixels[offset + 1] = value * .984;
    pixels[offset + 2] = value * .965;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function filterPixels(pixels: Uint8Array) {
  const half = new Uint8Array(pixels.length / 4);
  const stride = tileWidth * 4;
  let target = 0;
  for (let y = 0; y < tileHeight; y += 2) {
    for (let x = 0; x < tileWidth; x += 2) {
      const source = y * stride + x * 4;
      for (let c = 0; c < 4; c++) {
        const i = source + c;
        half[target++] = (pixels[i] + pixels[i + 4] + pixels[i + stride] + pixels[i + stride + 4]) * .25;
      }
    }
  }
  return half;
}

export function curlMaterial(tint: T.Color, closeup: boolean): T.MeshStandardMaterial {
  detailedPixels ??= fiberPixels();
  const pixels = closeup ? detailedPixels : (distantPixels ??= filterPixels(detailedPixels));
  const scale = closeup ? 1 : .5;
  const map = new T.DataTexture(pixels, tileWidth * scale, tileHeight * scale);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.magFilter = T.LinearFilter;
  map.anisotropy = closeup ? 4 : 2;
  map.generateMipmaps = true;
  map.needsUpdate = true;

  const surface = { color: tint.clone().multiplyScalar(closeup ? 1.12 : 1), map, roughness: .65, vertexColors: true };
  if (!closeup) return new T.MeshStandardMaterial(surface);
  return new T.MeshPhysicalMaterial({
    ...surface,
    bumpMap: map,
    bumpScale: .00040,
    // El eje v sigue cada fibra y orienta el reflejo longitudinal.
    anisotropy: .58,
    anisotropyRotation: Math.PI / 2,
    roughness: .53,
    specularIntensity: .56,
    specularColor: new T.Color('#ffe0bc'),
  });
}
