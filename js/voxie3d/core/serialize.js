/**
 * Volume schema:
 * {
 *   mode?: 'part'|'world',
 *   size,                    // cubic fallback / part default
 *   worldSize?: {x,y,z},     // explicit extents (world or non-cube)
 *   voxels: [{x,y,z,color,partId?}],
 *   axis, slice, partId,
 *   seed?: number,           // world terrain seed (optional)
 *   groups?: [{ id, name, color, voxelKeys: string[] }],
 *   meta?: object
 * }
 */

export const AXES = ["x", "y", "z"];
export const MODES = ["part", "world"];

const MIN_DIM = 2;
const MAX_DIM = 128;

export function clampDim(n, fallback = 24) {
  const v = Number.isFinite(n) ? n | 0 : fallback;
  return Math.max(MIN_DIM, Math.min(MAX_DIM, v));
}

export { MIN_DIM, MAX_DIM };

/**
 * Resolve {x,y,z} extents from volume / options.
 * Part mode defaults to cubic `size`; world mode prefers `worldSize`.
 */
export function normalizeWorldSize(raw = {}, fallbackSize = 24) {
  const fb = clampDim(fallbackSize, 24);
  const ws = raw.worldSize;
  if (ws && typeof ws === "object") {
    return {
      x: clampDim(ws.x, fb),
      y: clampDim(ws.y, fb),
      z: clampDim(ws.z, fb),
    };
  }
  if (Number.isFinite(raw.sizeX) && Number.isFinite(raw.sizeY) && Number.isFinite(raw.sizeZ)) {
    return {
      x: clampDim(raw.sizeX, fb),
      y: clampDim(raw.sizeY, fb),
      z: clampDim(raw.sizeZ, fb),
    };
  }
  const s = clampDim(raw.size, fb);
  return { x: s, y: s, z: s };
}

export function normalizeMode(mode, hint) {
  if (MODES.includes(mode)) return mode;
  if (hint && MODES.includes(hint)) return hint;
  return "part";
}

export function cloneVoxel(v) {
  const out = {
    x: v.x | 0,
    y: v.y | 0,
    z: v.z | 0,
    color: typeof v.color === "string" ? v.color : "#c4e070",
    ...(v.partId != null ? { partId: String(v.partId) } : {}),
  };
  if (typeof v.textureId === "string" && v.textureId) out.textureId = v.textureId;
  if (v.texScale === 8 || v.texScale === 16) out.texScale = v.texScale;
  if (typeof v.materialId === "string" && v.materialId) out.materialId = v.materialId;
  if (typeof v.block === "string" && v.block) out.block = v.block;
  return out;
}

function parseGroupKey(key) {
  const parts = String(key).split("|").map(Number);
  return parts.length === 3 && parts.every(Number.isFinite);
}

/** Normalize volume.groups for export/import (empty arrays omitted by callers if desired). */
export function normalizeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const id = typeof g.id === "string" && g.id ? g.id : `grp_${out.length + 1}`;
    const name = typeof g.name === "string" && g.name.trim() ? g.name.trim() : id;
    const color = typeof g.color === "string" ? g.color : "#c4e070";
    const voxelKeys = Array.isArray(g.voxelKeys)
      ? [...new Set(g.voxelKeys.map(String).filter(parseGroupKey))]
      : [];
    out.push({ id, name, color, voxelKeys });
  }
  return out;
}

export function normalizeVolume(raw = {}) {
  const mode = normalizeMode(raw.mode);
  const defaultSize = mode === "world" ? 32 : 24;
  const worldSize = normalizeWorldSize(raw, raw.size ?? defaultSize);
  // Keep `size` as X extent for backward-compatible cubic readers;
  // non-cube worlds also expose worldSize.
  const size = worldSize.x;
  const out = {
    mode,
    size,
    worldSize,
    voxels: Array.isArray(raw.voxels) ? raw.voxels.map(cloneVoxel) : [],
    axis: AXES.includes(raw.axis) ? raw.axis : "z",
    slice: Number.isFinite(raw.slice) ? raw.slice | 0 : 0,
    partId: typeof raw.partId === "string" ? raw.partId : "part_main",
  };
  if (Number.isFinite(raw.seed)) out.seed = raw.seed >>> 0;
  const groups = normalizeGroups(raw.groups);
  if (groups.length) out.groups = groups;
  if (raw.meta && typeof raw.meta === "object") out.meta = { ...raw.meta };
  return out;
}

export function volumeToJSON(volume) {
  const v = normalizeVolume(volume);
  const json = {
    mode: v.mode,
    size: v.size,
    worldSize: { ...v.worldSize },
    voxels: v.voxels.map(cloneVoxel),
    axis: v.axis,
    slice: v.slice,
    partId: v.partId,
  };
  if (Number.isFinite(v.seed)) json.seed = v.seed >>> 0;
  if (Array.isArray(v.groups) && v.groups.length) {
    json.groups = v.groups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      voxelKeys: [...g.voxelKeys],
    }));
  }
  if (v.meta && typeof v.meta === "object") json.meta = { ...v.meta };
  return json;
}
