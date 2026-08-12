/**
 * Brush-effect automation presets for ready assets.
 * Apply to selection / group / stroke cells — simple color ops, not full Photoshop.
 *
 * Presets: shadow, glow, outline, emboss.
 */

import { hexToRgb, rgbToHex, hexToHsb, hsbToHex, clamp, normalizeHex } from "../color/hsb.js";

/**
 * @typedef {{ x:number, y:number, z:number, color:string }} EffectVoxel
 * @typedef {{ id:string, name:string, description:string }} EffectPresetMeta
 */

/** @type {EffectPresetMeta[]} */
export const EFFECT_PRESETS = [
  { id: "shadow", name: "Shadow", description: "Darken bottom / −Y faces of the set" },
  { id: "glow", name: "Glow", description: "Lighten rim / exposed neighbors" },
  { id: "outline", name: "Outline", description: "Darken voxels on the set boundary" },
  { id: "emboss", name: "Emboss", description: "Brighten +Y / +X, darken −Y / −X" },
];

function keyOf(v) {
  return `${v.x}|${v.y}|${v.z}`;
}

function adjustBrightness(hex, delta) {
  const hsb = hexToHsb(hex);
  return hsbToHex(hsb.h, hsb.s, clamp(hsb.b + delta, 0, 100));
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const u = clamp(t, 0, 1);
  return rgbToHex(
    Math.round(A.r + (B.r - A.r) * u),
    Math.round(A.g + (B.g - A.g) * u),
    Math.round(A.b + (B.b - A.b) * u)
  );
}

function neighborKeys(x, y, z) {
  return [
    `${x + 1}|${y}|${z}`,
    `${x - 1}|${y}|${z}`,
    `${x}|${y + 1}|${z}`,
    `${x}|${y - 1}|${z}`,
    `${x}|${y}|${z + 1}`,
    `${x}|${y}|${z - 1}`,
  ];
}

/**
 * @param {EffectVoxel[]} voxels
 * @param {string} effectId
 * @param {{ strength?: number, outlineColor?: string }} [opts]
 * @returns {EffectVoxel[]} new colors (same positions)
 */
export function applyEffect(voxels, effectId, opts = {}) {
  const list = Array.isArray(voxels) ? voxels : [];
  if (!list.length) return [];
  const strength = clamp(Number(opts.strength) || 0.35, 0.05, 1);
  const set = new Set(list.map(keyOf));
  const id = String(effectId || "shadow");

  return list.map((v) => {
    const base = normalizeHex(v.color);
    let color = base;
    const exposed = neighborKeys(v.x, v.y, v.z).filter((k) => !set.has(k)).length;
    const isBoundary = exposed > 0;

    if (id === "shadow") {
      // Darken lower voxels and those with open −Y neighbor.
      const openDown = !set.has(`${v.x}|${v.y - 1}|${v.z}`);
      let dark = 0;
      if (openDown) dark += 18 * strength;
      // Relative height within selection
      const ys = list.map((c) => c.y);
      const ymin = Math.min(...ys);
      const ymax = Math.max(...ys);
      const t = ymax === ymin ? 0 : (v.y - ymin) / (ymax - ymin);
      dark += (1 - t) * 22 * strength;
      color = adjustBrightness(base, -dark);
    } else if (id === "glow") {
      if (isBoundary) {
        color = adjustBrightness(base, 28 * strength * (exposed / 6));
      }
    } else if (id === "outline") {
      if (isBoundary) {
        const ink = normalizeHex(opts.outlineColor || "#1a2018");
        color = mixHex(base, ink, 0.55 * strength + 0.25);
      }
    } else if (id === "emboss") {
      let d = 0;
      if (!set.has(`${v.x}|${v.y + 1}|${v.z}`)) d += 14;
      if (!set.has(`${v.x + 1}|${v.y}|${v.z}`)) d += 8;
      if (!set.has(`${v.x}|${v.y - 1}|${v.z}`)) d -= 14;
      if (!set.has(`${v.x - 1}|${v.y}|${v.z}`)) d -= 8;
      color = adjustBrightness(base, d * strength);
    }

    return { x: v.x, y: v.y, z: v.z, color: normalizeHex(color) };
  });
}

/**
 * Apply effect using grid getters for a key list.
 * @param {Iterable<string>} keys
 * @param {(x:number,y:number,z:number)=>string|null} getColor
 * @param {string} effectId
 * @param {object} [opts]
 */
export function applyEffectToKeys(keys, getColor, effectId, opts) {
  const voxels = [];
  for (const k of keys) {
    const [x, y, z] = String(k).split("|").map(Number);
    const color = getColor(x, y, z);
    if (!color) continue;
    voxels.push({ x, y, z, color });
  }
  return applyEffect(voxels, effectId, opts);
}
