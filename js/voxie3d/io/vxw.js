/**
 * VXW1 — Voxie World document (world / terrain / map volumes).
 *
 * Vertical bounds are author-overridable (not hard-locked to z ≥ 0):
 *   zMin (default 0): voxels with z < zMin are out of bounds → stripped on write.
 *   zMax (optional):  if set, voxels with z > zMax are stripped on write.
 *   waterLevel (optional): sea / water surface marker in world Z (not a cull).
 *
 * Negative z is intentional for oceans / underwater volumes
 * (e.g. zMin: -100 so water columns can extend below sea level).
 */

import { normalizeVolume, volumeToJSON } from "../core/serialize.js";

export const VXW_MAGIC = "VXW1";
export const VXW_KINDS = ["world", "terrain", "map"];
export const DEFAULT_Z_MIN = 0;

/**
 * @typedef {object} WorldBounds
 * @property {number} zMin
 * @property {number} [zMax]
 * @property {number} [waterLevel]
 */

/**
 * @param {object} [raw]
 * @returns {WorldBounds}
 */
export function normalizeWorldBounds(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const zMin = Number.isFinite(src.zMin) ? (src.zMin | 0) : DEFAULT_Z_MIN;
  /** @type {WorldBounds} */
  const out = { zMin };
  if (Number.isFinite(src.zMax)) out.zMax = src.zMax | 0;
  const water = Number.isFinite(src.waterLevel)
    ? src.waterLevel
    : Number.isFinite(src.seaLevel)
      ? src.seaLevel
      : null;
  if (water != null) out.waterLevel = water | 0;
  if (out.zMax != null && out.zMax < out.zMin) out.zMax = out.zMin;
  return out;
}

/**
 * Cull voxels strictly below zMin / above zMax (when set).
 * Does NOT treat 0 as a hard floor — only the configured zMin.
 * @param {Array<{z:number}>} voxels
 * @param {WorldBounds} bounds
 */
export function cullVoxelsByZ(voxels, bounds) {
  const b = normalizeWorldBounds(bounds);
  if (!Array.isArray(voxels)) return [];
  return voxels.filter((v) => {
    const z = v.z | 0;
    if (z < b.zMin) return false;
    if (b.zMax != null && z > b.zMax) return false;
    return true;
  });
}

export function isVxw(raw) {
  return !!(raw && typeof raw === "object" && raw.magic === VXW_MAGIC);
}

export function normalizeVxwKind(kind, fallback = "world") {
  if (VXW_KINDS.includes(kind)) return kind;
  return VXW_KINDS.includes(fallback) ? fallback : "world";
}

/**
 * Build a VXW1 document from a volume (+ optional bounds / kind).
 * Strips voxels outside configured zMin..zMax on write.
 *
 * @param {object} volume
 * @param {{ kind?: string, bounds?: WorldBounds, name?: string }} [opts]
 */
export function serializeVxw(volume, opts = {}) {
  const kind = normalizeVxwKind(opts.kind || volume?.meta?.vxwKind || "world");
  const fromMeta = volume?.meta?.worldBounds;
  const bounds = normalizeWorldBounds(opts.bounds || fromMeta || {});
  const base = volumeToJSON(volume || {});
  // Force world-mode storage for VXW kinds (terrain/map are project roles).
  base.mode = "world";
  base.voxels = cullVoxelsByZ(base.voxels, bounds);
  const meta = { ...(base.meta || {}) };
  meta.vxwKind = kind;
  meta.worldBounds = { ...bounds };
  base.meta = meta;

  /** @type {Record<string, unknown>} */
  const doc = {
    magic: VXW_MAGIC,
    kind,
    zMin: bounds.zMin,
    volume: base,
  };
  if (bounds.zMax != null) doc.zMax = bounds.zMax;
  if (bounds.waterLevel != null) doc.waterLevel = bounds.waterLevel;
  if (typeof opts.name === "string" && opts.name) doc.name = opts.name;
  return doc;
}

/**
 * Parse VXW1 (object or JSON string) → { kind, bounds, volume, name? }.
 * Re-applies cull on load so corrupt/oob cells below zMin are dropped.
 *
 * @param {object|string} raw
 */
export function parseVxw(raw) {
  const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isVxw(doc)) {
    throw new Error("Not a VXW1 document (missing magic:'VXW1')");
  }
  const kind = normalizeVxwKind(doc.kind, "world");
  const bounds = normalizeWorldBounds({
    zMin: doc.zMin,
    zMax: doc.zMax,
    waterLevel: doc.waterLevel ?? doc.seaLevel,
    ...(doc.bounds && typeof doc.bounds === "object" ? doc.bounds : {}),
  });
  const volRaw = doc.volume && typeof doc.volume === "object" ? doc.volume : doc;
  const volume = normalizeVolume(volRaw);
  volume.mode = "world";
  volume.voxels = cullVoxelsByZ(volume.voxels, bounds);
  volume.meta = {
    ...(volume.meta || {}),
    vxwKind: kind,
    worldBounds: { ...bounds },
  };
  return {
    magic: VXW_MAGIC,
    kind,
    bounds,
    volume,
    name: typeof doc.name === "string" ? doc.name : undefined,
  };
}

/** Convenience: volume + bounds ready for importVolume / UI. */
export function loadVxw(raw) {
  return parseVxw(raw);
}
