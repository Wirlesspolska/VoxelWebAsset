/**
 * Procedural terrain block texture atlas (canvas noise → DataTexture).
 * Tiles: grass, dirt, sand, stone, water, snow, lava, cactus, wood, ice, bedrock, leaves, paint.
 * Potato/LOD can drop to flat average colors far away.
 */

import * as THREE from "three";
import { getAssetCache } from "../cache/AssetCache.js";
import { BLOCK_IDS, BLOCK_COLORS, blockAtlasMeta } from "./blockAtlasMeta.js";

export { BLOCK_IDS, BLOCK_COLORS, blockAtlasMeta };

const TILE_PX = 16;

function hash(x, y, salt) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (salt >>> 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function hexToRgb(hex) {
  const h = String(hex || "#888888").replace("#", "");
  const full = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixRgb(a, b, t) {
  return {
    r: (a.r + (b.r - a.r) * t) | 0,
    g: (a.g + (b.g - a.g) * t) | 0,
    b: (a.b + (b.b - a.b) * t) | 0,
  };
}

/**
 * Fill one tile into RGBA buffer.
 * @param {Uint8Array} data
 * @param {number} atlasW
 * @param {number} col
 * @param {number} row
 * @param {string} blockId
 */
function paintTile(data, atlasW, col, row, blockId) {
  const base = hexToRgb(BLOCK_COLORS[blockId] || "#888888");
  const salt = blockId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;

  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = hash(x, y, salt);
      const n2 = hash(x + 3, y - 2, salt + 17);
      let rgb = base;
      if (blockId === "grass") {
        rgb = mixRgb(base, hexToRgb("#3d6b28"), n * 0.45);
        if (y < 3) rgb = mixRgb(rgb, hexToRgb("#6db84a"), 0.5);
      } else if (blockId === "dirt") {
        rgb = mixRgb(base, hexToRgb("#4a3218"), n * 0.35);
      } else if (blockId === "sand") {
        rgb = mixRgb(base, hexToRgb("#e0d4a8"), n * 0.4);
      } else if (blockId === "stone") {
        rgb = mixRgb(base, hexToRgb("#4a4e48"), n > 0.7 ? 0.5 : n * 0.25);
      } else if (blockId === "water") {
        rgb = mixRgb(base, hexToRgb("#4ab0e0"), (n + n2) * 0.25);
      } else if (blockId === "snow") {
        rgb = mixRgb(base, hexToRgb("#ffffff"), n * 0.35);
      } else if (blockId === "lava") {
        rgb = mixRgb(base, hexToRgb("#ffcc44"), n2 > 0.65 ? 0.7 : n * 0.3);
      } else if (blockId === "cactus") {
        rgb = mixRgb(base, hexToRgb("#1e5a28"), n * 0.4);
        if (x === 0 || x === TILE_PX - 1) rgb = mixRgb(rgb, hexToRgb("#2a4a28"), 0.5);
      } else if (blockId === "wood") {
        rgb = mixRgb(base, hexToRgb("#3a2818"), x % 4 === 0 ? 0.45 : n * 0.2);
      } else if (blockId === "ice") {
        rgb = mixRgb(base, hexToRgb("#ffffff"), n * 0.3);
        if (n2 > 0.85) rgb = mixRgb(rgb, hexToRgb("#6a9ec4"), 0.4);
      } else if (blockId === "bedrock") {
        rgb = mixRgb(base, hexToRgb("#101210"), n * 0.5);
      } else if (blockId === "leaves") {
        rgb = mixRgb(base, hexToRgb("#2a5020"), n * 0.5);
      } else if (blockId === "paint") {
        rgb = { r: 255, g: 255, b: 255 };
      }

      const px = ox + x;
      const py = oy + y;
      const o = (py * atlasW + px) * 4;
      data[o] = rgb.r;
      data[o + 1] = rgb.g;
      data[o + 2] = rgb.b;
      data[o + 3] = 255;
    }
  }
}

/**
 * @returns {{
 *   ids: string[],
 *   size: number,
 *   tilePx: number,
 *   indexOf: (id:string)=>number,
 *   materialKeyIndex: Record<string, number>,
 *   colorToBlock: Record<string, string>,
 *   ensureTexture: (potato?:boolean)=>THREE.DataTexture,
 *   materialFor: (opts?:{potato?:boolean, lit?:boolean})=>THREE.Material,
 *   resolveBlock: (v:{color?:string,block?:string})=>string|null,
 * }}
 */
export function createBlockAtlas() {
  const meta = blockAtlasMeta();
  const ids = meta.ids;
  const size = meta.size;
  const atlasPx = size * TILE_PX;
  const assetCache = getAssetCache();

  /** @type {Record<string, number>} */
  const indexOfMap = {};
  ids.forEach((id, i) => {
    indexOfMap[id] = i;
  });

  /** @type {Record<string, number>} */
  const materialKeyIndex = { ...meta.materialKeyIndex };
  /** @type {Record<string, string>} */
  const colorToBlock = {};
  for (const id of ids) {
    if (id === "paint") continue;
    const hex = BLOCK_COLORS[id].toLowerCase();
    colorToBlock[hex] = id;
  }
  colorToBlock["#3a8ec4"] = "water";
  colorToBlock["#3d6b28"] = "leaves";
  colorToBlock["#5a6a48"] = "leaves";

  function indexOf(id) {
    return indexOfMap[id] ?? 0;
  }

  function ensureTexture(potato = false) {
    const key = `block-atlas:${potato ? 1 : 0}:${atlasPx}`;
    let tex = assetCache.get(key);
    if (tex) return tex;

    if (potato) {
      const data = new Uint8Array(size * size * 4);
      for (let i = 0; i < ids.length; i++) {
        const { r, g, b } = hexToRgb(BLOCK_COLORS[ids[i]]);
        const o = i * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
      tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    } else {
      const data = new Uint8Array(atlasPx * atlasPx * 4);
      for (let i = 0; i < ids.length; i++) {
        const col = i % size;
        const row = Math.floor(i / size);
        paintTile(data, atlasPx, col, row, ids[i]);
      }
      tex = new THREE.DataTexture(data, atlasPx, atlasPx, THREE.RGBAFormat);
    }
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    assetCache.set(key, tex, "datatexture");
    return tex;
  }

  /**
   * @param {{ potato?: boolean, lit?: boolean }} [opts]
   */
  function materialFor(opts = {}) {
    const potato = !!opts.potato;
    const lit = !!opts.lit;
    const key = `block-atlas-mat:${potato ? 1 : 0}:${lit ? 1 : 0}`;
    let mat = assetCache.getMaterial(key);
    if (mat) return mat;
    const map = ensureTexture(potato);
    if (lit) {
      mat = new THREE.MeshLambertMaterial({
        map,
        vertexColors: true,
      });
    } else {
      mat = new THREE.MeshBasicMaterial({
        map,
        vertexColors: true,
      });
    }
    assetCache.rememberMaterial(key, mat);
    return mat;
  }

  /**
   * @param {{ color?: string, block?: string }} v
   */
  function resolveBlock(v) {
    if (v?.block && indexOfMap[v.block] != null) return v.block;
    const hex = String(v?.color || "").trim().toLowerCase();
    return colorToBlock[hex] || null;
  }

  return {
    ids,
    size,
    tilePx: TILE_PX,
    indexOf,
    materialKeyIndex,
    colorToBlock,
    ensureTexture,
    materialFor,
    resolveBlock,
    BLOCK_COLORS,
  };
}
