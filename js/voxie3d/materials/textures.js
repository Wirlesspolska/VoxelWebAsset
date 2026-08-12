/**
 * Canvas / DataTexture cache for texturizer bitmaps.
 */

import * as THREE from "three";
import { hexToRgb } from "../color/hsb.js";
import {
  createTextureDef,
  hydrateTextureDef,
  serializeTextureDef,
  generateTexturePixels,
  averagePixelColor,
  clampTexSize,
} from "../tools/texturizer.js";
import { getAssetCache } from "../cache/AssetCache.js";

/**
 * @returns {{
 *   get: (id:string)=>any,
 *   put: (def:any)=>any,
 *   ensureDataTexture: (def:any, potato?:boolean)=>THREE.DataTexture|null,
 *   materialFor: (def:any, potato?:boolean)=>THREE.Material,
 *   exportAll: ()=>object,
 *   importAll: (map:object)=>void,
 *   list: ()=>any[],
 * }}
 */
export function createTextureStore() {
  /** @type {Map<string, any>} */
  const defs = new Map();
  const assetCache = getAssetCache();

  function put(def) {
    const hydrated = def.pixels ? def : hydrateTextureDef(def);
    if (!hydrated) return null;
    defs.set(hydrated.id, hydrated);
    assetCache.set(`texture:${hydrated.id}`, serializeTextureDef(hydrated), "texture");
    return hydrated;
  }

  function get(id) {
    return defs.get(id) || null;
  }

  function list() {
    return [...defs.values()];
  }

  function exportAll() {
    const out = {};
    for (const [id, def] of defs) out[id] = serializeTextureDef(def);
    return out;
  }

  function importAll(map) {
    if (!map || typeof map !== "object") return;
    for (const raw of Object.values(map)) {
      const d = hydrateTextureDef(raw);
      if (d) defs.set(d.id, d);
    }
  }

  /**
   * Build or reuse a NearestFilter DataTexture (or 1×1 in potato).
   */
  function ensureDataTexture(def, potato = false) {
    const hydrated = typeof def === "string" ? get(def) : def.pixels ? def : put(def);
    if (!hydrated) return null;
    const size = potato ? 1 : clampTexSize(hydrated.size);
    const cacheKey = `texdata:${hydrated.id}:${size}`;
    let tex = assetCache.get(cacheKey);
    if (tex) return tex;

    let pixels = hydrated.pixels;
    if (!pixels) {
      pixels = generateTexturePixels(hydrated.weights, hydrated.size, hydrated.seed);
      hydrated.pixels = pixels;
    }

    let data;
    let w;
    let h;
    if (potato) {
      const avg = hexToRgb(averagePixelColor(pixels));
      data = new Uint8Array([avg.r, avg.g, avg.b, 255]);
      w = 1;
      h = 1;
    } else {
      w = size;
      h = size;
      data = new Uint8Array(w * h * 4);
      const src = size === hydrated.size ? pixels : generateTexturePixels(hydrated.weights, size, hydrated.seed);
      for (let i = 0; i < w * h; i++) {
        const { r, g, b } = hexToRgb(src[i] || "#888888");
        const o = i * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }

    tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    assetCache.set(cacheKey, tex, "datatexture");
    assetCache.rememberMaterial?.(cacheKey, tex);
    return tex;
  }

  function materialFor(def, potato = false) {
    const hydrated = typeof def === "string" ? get(def) : put(def);
    if (!hydrated) {
      return new THREE.MeshBasicMaterial({ color: 0xffffff });
    }
    const key = `texmat:${hydrated.id}:${potato ? 1 : hydrated.size}`;
    let mat = assetCache.getMaterial(key);
    if (mat) return mat;
    const map = ensureDataTexture(hydrated, potato);
    mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: potato ? null : map,
    });
    if (potato) {
      mat.color.set(averagePixelColor(hydrated.pixels || []));
    }
    assetCache.rememberMaterial(key, mat);
    return mat;
  }

  return {
    get,
    put,
    ensureDataTexture,
    materialFor,
    exportAll,
    importAll,
    list,
    create: (opts) => put(createTextureDef(opts)),
  };
}
