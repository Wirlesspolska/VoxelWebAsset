/**
 * Texturizer — weighted dice-roll / noise into 8×8 or 16×16 bitmaps.
 * No hand-authored wood images; palette weights + seed regenerate on reload.
 */

import { normalizeHex, hexToRgb, rgbToHex, clamp } from "../color/hsb.js";
import { hashUnit } from "../materials/palettes.js";

/**
 * @typedef {{ hex: string, weight: number }} TexWeight
 * @typedef {{ id: string, size: 8|16, seed: number, weights: TexWeight[], pixels?: string }} TextureDef
 */

export function normalizeWeights(weights) {
  const list = Array.isArray(weights) ? weights : [];
  const out = [];
  for (const w of list) {
    if (!w) continue;
    const hex = normalizeHex(w.hex || w.color);
    const weight = Math.max(0, Number(w.weight) || 0);
    if (weight <= 0) continue;
    out.push({ hex, weight });
  }
  if (!out.length) out.push({ hex: "#c4e070", weight: 1 });
  return out;
}

function pickWeighted(weights, t) {
  const sum = weights.reduce((a, w) => a + w.weight, 0) || 1;
  let r = t * sum;
  for (const w of weights) {
    r -= w.weight;
    if (r <= 0) return w.hex;
  }
  return weights[weights.length - 1].hex;
}

/**
 * Generate pixel hex grid (row-major).
 * @param {TexWeight[]} weights
 * @param {8|16|number} size
 * @param {number} seed
 * @returns {string[]}
 */
export function generateTexturePixels(weights, size = 8, seed = 1) {
  const s = size >= 16 ? 16 : 8;
  const wts = normalizeWeights(weights);
  const pixels = new Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const t = hashUnit(x, y, seed | 0, (seed | 0) ^ 0x9e3779b9);
      // Mild spatial blend so neighbors correlate slightly.
      const n = hashUnit(x >> 1, y >> 1, seed | 0, 19);
      const mix = t * 0.7 + n * 0.3;
      pixels[y * s + x] = pickWeighted(wts, mix);
    }
  }
  return pixels;
}

/** Average hex of a pixel list (for potato / flat fallback). */
export function averagePixelColor(pixels) {
  if (!pixels?.length) return "#c4e070";
  let r = 0;
  let g = 0;
  let b = 0;
  for (const hex of pixels) {
    const c = hexToRgb(hex);
    r += c.r;
    g += c.g;
    b += c.b;
  }
  const n = pixels.length;
  return rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n));
}

/**
 * Sample texture at voxel face UV-ish (integer cell coords).
 */
export function sampleTextureAt(def, x, y, z, face = 0) {
  const pixels = def.pixels || generateTexturePixels(def.weights, def.size, def.seed);
  const s = def.size >= 16 ? 16 : 8;
  const u = ((x | 0) + (face === 1 ? (z | 0) : 0)) & (s - 1);
  const v = ((y | 0) + (face === 2 ? (z | 0) : 0)) & (s - 1);
  return pixels[v * s + u] || def.weights?.[0]?.hex || "#c4e070";
}

/**
 * Create a TextureDef from UI options.
 * @param {{ weights: TexWeight[], size?: number, seed?: number, id?: string }} opts
 */
export function createTextureDef(opts = {}) {
  const size = opts.size >= 16 ? 16 : 8;
  const seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
  const weights = normalizeWeights(opts.weights);
  const pixels = generateTexturePixels(weights, size, seed);
  const id =
    typeof opts.id === "string" && opts.id
      ? opts.id
      : `tex_${seed.toString(16)}_${size}`;
  return {
    id,
    size,
    seed,
    weights,
    pixels,
  };
}

/** Compact export for volume.meta.textures */
export function serializeTextureDef(def) {
  return {
    id: def.id,
    size: def.size >= 16 ? 16 : 8,
    seed: def.seed >>> 0,
    weights: normalizeWeights(def.weights),
  };
}

export function hydrateTextureDef(raw) {
  if (!raw || typeof raw !== "object") return null;
  const size = raw.size >= 16 ? 16 : 8;
  const seed = Number.isFinite(raw.seed) ? raw.seed >>> 0 : 1;
  const weights = normalizeWeights(raw.weights);
  const pixels = generateTexturePixels(weights, size, seed);
  const id = typeof raw.id === "string" && raw.id ? raw.id : `tex_${seed.toString(16)}`;
  return { id, size, seed, weights, pixels };
}

/**
 * Apply texturizer: set each voxel color from dice-roll at its coords (or keep base + overlay).
 * Mode `replace` paints sampled color; voxels keep textureId for reload.
 */
export function applyTexturizerToCells(cells, def, mode = "replace") {
  const hydrated = def.pixels ? def : hydrateTextureDef(def);
  if (!hydrated) return [];
  return cells.map((c) => {
    const sampled = sampleTextureAt(hydrated, c.x, c.y, c.z, 0);
    return {
      x: c.x,
      y: c.y,
      z: c.z,
      color: mode === "tint" ? sampled : sampled,
      textureId: hydrated.id,
      texScale: hydrated.size >= 16 ? 16 : 8,
    };
  });
}

export function clampTexSize(n) {
  return n >= 16 ? 16 : 8;
}

export { clamp };
