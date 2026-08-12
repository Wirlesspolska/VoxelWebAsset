/**
 * Collective channel / HSB transforms for group members.
 * Pure helpers — caller writes via setVoxel.
 */

import { hexToRgb, rgbToHex, hexToHsb, hsbToHex, clamp, normalizeHex } from "../color/hsb.js";

function parseKey(key) {
  const [x, y, z] = String(key).split("|").map(Number);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x: x | 0, y: y | 0, z: z | 0 };
}

/**
 * @param {string} hex
 * @param {{ hue?: number, brightness?: number, r?: number, g?: number, b?: number, variety?: boolean, varietyAmt?: number, seed?: number }} adj
 */
export function applyChannelToHex(hex, adj = {}) {
  const variety = !!adj.variety;
  const amt = clamp(Number(adj.varietyAmt) || 8, 0, 40);
  let hsb = hexToHsb(normalizeHex(hex));
  if (adj.hue != null && Number.isFinite(adj.hue)) {
    let dh = Number(adj.hue);
    if (variety) {
      // Deterministic-ish jitter from color itself when seed not provided
      const jitter = ((hsb.h * 17 + hsb.s * 3 + (adj.seed || 0) * 13) % 100) / 100;
      dh += (jitter - 0.5) * 2 * amt;
    }
    hsb.h = ((hsb.h + dh) % 360 + 360) % 360;
  }
  if (adj.brightness != null && Number.isFinite(adj.brightness)) {
    hsb.b = clamp(hsb.b + Number(adj.brightness), 0, 100);
  }
  if (adj.saturation != null && Number.isFinite(adj.saturation)) {
    hsb.s = clamp(hsb.s + Number(adj.saturation), 0, 100);
  }
  let { r, g, b } = hexToRgb(hsbToHex(hsb.h, hsb.s, hsb.b));
  if (adj.r != null && Number.isFinite(adj.r)) r = clamp(r + (adj.r | 0), 0, 255);
  if (adj.g != null && Number.isFinite(adj.g)) g = clamp(g + (adj.g | 0), 0, 255);
  if (adj.b != null && Number.isFinite(adj.b)) b = clamp(b + (adj.b | 0), 0, 255);
  return rgbToHex(r, g, b);
}

/**
 * @param {Iterable<string>} keys
 * @param {(x:number,y:number,z:number)=>string|null} getColor
 * @param {(x:number,y:number,z:number,color:string)=>void} setVoxel
 * @param {object} adj
 */
export function applyChannelsToKeys(keys, getColor, setVoxel, adj = {}) {
  let n = 0;
  let i = 0;
  for (const key of keys) {
    const c = parseKey(key);
    if (!c) continue;
    const cur = getColor(c.x, c.y, c.z);
    if (!cur) continue;
    const next = applyChannelToHex(cur, { ...adj, seed: i++ });
    setVoxel(c.x, c.y, c.z, next);
    n++;
  }
  return n;
}

/**
 * Cluster voxel keys by identical (or near) color.
 * @param {Array<{x:number,y:number,z:number,color:string}>} voxels
 * @param {{ tolerance?: number, selectionKeys?: Set<string>|string[]|null }} [opts]
 * @returns {Map<string, { color: string, keys: string[] }>}
 */
export function clusterByColor(voxels, opts = {}) {
  const tol = Math.max(0, Number(opts.tolerance) || 0);
  const sel = opts.selectionKeys
    ? opts.selectionKeys instanceof Set
      ? opts.selectionKeys
      : new Set(opts.selectionKeys)
    : null;
  /** @type {Map<string, { color: string, keys: string[], rgb: {r:number,g:number,b:number} }>} */
  const buckets = new Map();

  for (const v of voxels) {
    if (!v) continue;
    const key = `${v.x | 0}|${v.y | 0}|${v.z | 0}`;
    if (sel && !sel.has(key)) continue;
    const hex = normalizeHex(v.color);
    const rgb = hexToRgb(hex);
    let bucketKey = hex;
    if (tol > 0) {
      // Quantize into near-color bins
      const q = (n) => Math.round(n / (tol + 1)) * (tol + 1);
      bucketKey = rgbToHex(q(rgb.r), q(rgb.g), q(rgb.b));
    }
    let b = buckets.get(bucketKey);
    if (!b) {
      b = { color: hex, keys: [], rgb };
      buckets.set(bucketKey, b);
    }
    b.keys.push(key);
  }
  return buckets;
}
