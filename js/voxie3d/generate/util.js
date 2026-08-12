/**
 * Shared helpers for procedural stamp generators.
 */

import { createRng, hashSeed } from "../world/seed.js";
import { hexToRgb, rgbToHex } from "../color/hsb.js";

/** Soft footprint cap (~12³ cells). */
export const MAX_STAMP_CELLS = 12 * 12 * 12;
/** Max local extent along any axis. */
export const MAX_STAMP_EXTENT = 16;
/** User-facing size slider range. */
export const SIZE_MIN = 2;
export const SIZE_MAX = 12;

/**
 * @param {number} size
 * @returns {number}
 */
export function clampSize(size) {
  const n = size | 0;
  if (n < SIZE_MIN) return SIZE_MIN;
  if (n > SIZE_MAX) return SIZE_MAX;
  return n;
}

/**
 * @param {number} density 1–100
 * @returns {number} 0–1
 */
export function density01(density) {
  const d = density | 0;
  if (d <= 1) return 0.01;
  if (d >= 100) return 1;
  return d / 100;
}

/**
 * @param {number|string} seed
 * @param {...(string|number)} parts
 */
export function rngFrom(seed, ...parts) {
  const s = hashSeed(String(seed >>> 0), ...parts.map(String));
  return createRng(s || 1);
}

/**
 * @param {string} hex
 * @param {number} [mul=1]
 */
export function applyShadeMul(hex, mul = 1) {
  if (mul == null || mul === 1) return hex;
  const m = Math.max(0.2, Math.min(1.6, Number(mul) || 1));
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(Math.round(r * m), Math.round(g * m), Math.round(b * m));
}

/**
 * Deduplicate, clamp extent, and thin if over cell budget.
 * @param {{x:number,y:number,z:number,shade?:number}[]} cells
 * @param {{ maxCells?: number, maxExtent?: number }} [opts]
 */
export function capStamp(cells, opts = {}) {
  const maxCells = opts.maxCells ?? MAX_STAMP_CELLS;
  const maxExtent = opts.maxExtent ?? MAX_STAMP_EXTENT;
  const half = (maxExtent / 2) | 0;
  const lo = -half;
  const hi = half;
  /** @type {Map<string, {x:number,y:number,z:number,shade?:number}>} */
  const map = new Map();
  for (const c of cells || []) {
    const x = c.x | 0;
    const y = c.y | 0;
    const z = c.z | 0;
    if (x < lo || x > hi || y < lo || y > hi || z < lo || z > hi) continue;
    const key = `${x}|${y}|${z}`;
    if (!map.has(key)) {
      const out = { x, y, z };
      if (c.shade != null && c.shade !== 1) out.shade = c.shade;
      map.set(key, out);
    }
  }
  let list = [...map.values()];
  if (list.length > maxCells) {
    const step = Math.ceil(list.length / maxCells);
    list = list.filter((_, i) => i % step === 0).slice(0, maxCells);
  }
  return list;
}

/**
 * Push a cell into a working list (no dedupe).
 * @param {{x:number,y:number,z:number,shade?:number}[]} out
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [shade]
 */
export function pushCell(out, x, y, z, shade) {
  const c = { x: x | 0, y: y | 0, z: z | 0 };
  if (shade != null && shade !== 1) c.shade = shade;
  out.push(c);
}
