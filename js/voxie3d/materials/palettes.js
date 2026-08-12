/**
 * Material presets + cheap per-voxel noise tint for forge paint.
 * No heavy shaders — tint is applied once at place time as a hex color.
 */

import { hexToRgb, rgbToHex, clamp, normalizeHex } from "../color/hsb.js";

/**
 * @typedef {object} MaterialPreset
 * @property {string} id
 * @property {string} name
 * @property {string} color  base #rrggbb
 * @property {number} [noise] default tint strength 0–1
 * @property {string} [kind] 'terrain'|'neutral'
 */

/** @type {MaterialPreset[]} */
export const MATERIAL_PRESETS = [
  { id: "grass", name: "Grass", color: "#5a8f3c", noise: 0.1, kind: "terrain" },
  { id: "sand", name: "Sand", color: "#d2b48c", noise: 0.08, kind: "terrain" },
  { id: "gravel", name: "Gravel", color: "#8a8680", noise: 0.14, kind: "terrain" },
  { id: "dirt", name: "Dirt", color: "#6b4a2e", noise: 0.1, kind: "terrain" },
  { id: "stone", name: "Stone", color: "#6a6e68", noise: 0.08, kind: "terrain" },
  { id: "water", name: "Water", color: "#3d7ea6", noise: 0.06, kind: "terrain" },
  { id: "bone", name: "Bone", color: "#e8e4d4", noise: 0.04, kind: "neutral" },
  { id: "ash", name: "Ash", color: "#8a9078", noise: 0.05, kind: "neutral" },
  { id: "charcoal", name: "Charcoal", color: "#3a4434", noise: 0.05, kind: "neutral" },
  { id: "slate", name: "Slate", color: "#4a5560", noise: 0.06, kind: "neutral" },
];

export function getMaterialPreset(id) {
  return MATERIAL_PRESETS.find((p) => p.id === id) || null;
}

/** Stable 0–1 hash from integer coords + salt. */
export function hashUnit(x, y, z, salt = 0) {
  let n =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 2147483647) ^
    (salt >>> 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * Slight RGB jitter around a base color. Cheap; no shaders.
 * @param {string} hex
 * @param {number} amount 0–1 typical 0.05–0.15
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [salt]
 */
export function tintWithNoise(hex, amount, x, y, z, salt = 0) {
  const a = clamp(Number(amount) || 0, 0, 0.5);
  if (a <= 0) return typeof hex === "string" ? hex : "#c4e070";
  const { r, g, b } = hexToRgb(hex);
  const t = hashUnit(x, y, z, salt);
  // Map [0,1] → [-1,1] then scale by amount * 255
  const d = (t * 2 - 1) * a * 255;
  // Slight channel decorrelation so it doesn't look like flat brightness noise.
  const dr = d;
  const dg = (hashUnit(x, y, z, salt + 17) * 2 - 1) * a * 255 * 0.85;
  const db = (hashUnit(x, y, z, salt + 31) * 2 - 1) * a * 255 * 0.7;
  return rgbToHex(
    Math.round(clamp(r + dr, 0, 255)),
    Math.round(clamp(g + dg, 0, 255)),
    Math.round(clamp(b + db, 0, 255))
  );
}

/**
 * Resolve place color from base + optional material noise.
 * @param {{ baseHex: string, noiseEnabled?: boolean, noiseAmount?: number, materialId?: string|null, x: number, y: number, z: number }} opts
 */
export function resolveMaterialColor(opts) {
  const base = normalizeHex(opts.baseHex || "#c4e070");
  if (!opts.noiseEnabled) return base;
  const preset = opts.materialId ? getMaterialPreset(opts.materialId) : null;
  // Cap default noise so variation stays slight vs paint swatch.
  const amount = clamp(
    Number.isFinite(opts.noiseAmount)
      ? opts.noiseAmount
      : preset?.noise ?? 0.06,
    0,
    0.2
  );
  if (amount <= 0) return base;
  const salt = preset ? preset.id.length * 97 : 0;
  return normalizeHex(tintWithNoise(base, amount, opts.x, opts.y, opts.z, salt));
}
