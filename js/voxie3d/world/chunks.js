/**
 * World chunk grid helpers — adjoining XZ tiles for infinite-style growth.
 * Volume stays origin-centered; chunk extents expand worldSize as needed.
 */

export const CHUNK_DIRS = Object.freeze(["N", "E", "S", "W"]);

/** @type {Record<string, { dcx: number, dcz: number, label: string }>} */
export const DIR_OFFSETS = Object.freeze({
  N: { dcx: 0, dcz: 1, label: "North" },
  E: { dcx: 1, dcz: 0, label: "East" },
  S: { dcx: 0, dcz: -1, label: "South" },
  W: { dcx: -1, dcz: 0, label: "West" },
});

/**
 * @param {number} n
 * @param {number} [fallback=32]
 */
export function normalizeChunkSize(n, fallback = 32) {
  let s = Math.floor(Number(n));
  if (!Number.isFinite(s) || s < 8) s = fallback;
  if (s % 2) s += 1;
  return Math.min(256, s);
}

/**
 * @param {number} cx
 * @param {number} cz
 */
export function chunkKey(cx, cz) {
  return `${cx | 0},${cz | 0}`;
}

/**
 * @param {string} key
 * @returns {{ cx: number, cz: number } | null}
 */
export function parseChunkKey(key) {
  if (typeof key !== "string") return null;
  const m = /^(-?\d+),(-?\d+)$/.exec(key.trim());
  if (!m) return null;
  return { cx: Number(m[1]), cz: Number(m[2]) };
}

/**
 * Voxel AABB for chunk (cx,cz). Origin chunk (0,0) is centered on world origin.
 * @param {number} cx
 * @param {number} cz
 * @param {number} chunkSize even XZ footprint
 * @param {number} [height] Y extent (worldSize.y)
 * @returns {{ minX:number, maxX:number, minY:number, maxY:number, minZ:number, maxZ:number, cx:number, cz:number, chunkSize:number }}
 */
export function chunkBounds(cx, cz, chunkSize, height = 32) {
  const cs = normalizeChunkSize(chunkSize);
  const h = Math.max(4, Math.floor(Number(height) || 32));
  const half = cs / 2;
  const halfY = Math.floor(h / 2);
  const ox = (cx | 0) * cs;
  const oz = (cz | 0) * cs;
  return {
    cx: cx | 0,
    cz: cz | 0,
    chunkSize: cs,
    minX: ox - half,
    maxX: ox + half,
    minZ: oz - half,
    maxZ: oz + half,
    minY: -halfY,
    maxY: halfY,
  };
}

/**
 * World size needed to contain all listed chunk coords (centered volume).
 * @param {Iterable<{cx:number,cz:number}|string>} chunks
 * @param {number} chunkSize
 * @param {number} height
 */
export function worldSizeForChunks(chunks, chunkSize, height) {
  const cs = normalizeChunkSize(chunkSize);
  const h = Math.max(4, Math.floor(Number(height) || 32));
  let minCx = 0;
  let maxCx = 0;
  let minCz = 0;
  let maxCz = 0;
  let any = false;
  for (const c of chunks) {
    const parsed = typeof c === "string" ? parseChunkKey(c) : c;
    if (!parsed) continue;
    any = true;
    minCx = Math.min(minCx, parsed.cx);
    maxCx = Math.max(maxCx, parsed.cx);
    minCz = Math.min(minCz, parsed.cz);
    maxCz = Math.max(maxCz, parsed.cz);
  }
  if (!any) {
    return { x: cs, y: h % 2 ? h + 1 : h, z: cs };
  }
  const minX = minCx * cs - cs / 2;
  const maxX = maxCx * cs + cs / 2;
  const minZ = minCz * cs - cs / 2;
  const maxZ = maxCz * cs + cs / 2;
  const halfX = Math.max(-minX, maxX);
  const halfZ = Math.max(-minZ, maxZ);
  let x = halfX * 2;
  let z = halfZ * 2;
  let y = h % 2 ? h + 1 : h;
  if (x % 2) x += 1;
  if (z % 2) z += 1;
  return { x, y, z };
}

/**
 * Neighbor chunk coords from an anchor in one or more cardinal directions.
 * @param {number} cx
 * @param {number} cz
 * @param {string|string[]} dirs
 * @returns {{ cx:number, cz:number, dir:string }[]}
 */
export function neighborChunks(cx, cz, dirs) {
  const list = Array.isArray(dirs) ? dirs : [dirs];
  /** @type {{ cx:number, cz:number, dir:string }[]} */
  const out = [];
  const seen = new Set();
  for (const d of list) {
    const key = String(d || "").toUpperCase();
    const off = DIR_OFFSETS[key];
    if (!off) continue;
    const ncx = (cx | 0) + off.dcx;
    const ncz = (cz | 0) + off.dcz;
    const k = chunkKey(ncx, ncz);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ cx: ncx, cz: ncz, dir: key });
  }
  return out;
}

/**
 * @param {object|null|undefined} meta
 * @returns {{ chunkSize: number, height: number, map: Record<string, { biome: string, seed: number }> }}
 */
export function readChunkMeta(meta) {
  const raw = meta?.chunks && typeof meta.chunks === "object" ? meta.chunks : null;
  const chunkSize = normalizeChunkSize(raw?.chunkSize ?? meta?.chunkSize, 32);
  const height = Math.max(4, Math.floor(Number(raw?.height) || 32));
  /** @type {Record<string, { biome: string, seed: number }>} */
  const map = {};
  const src = raw?.map && typeof raw.map === "object" ? raw.map : null;
  if (src) {
    for (const [k, v] of Object.entries(src)) {
      if (!parseChunkKey(k)) continue;
      const biome = typeof v?.biome === "string" ? v.biome : "greenery";
      const seed = Number.isFinite(v?.seed) ? v.seed >>> 0 : 0;
      map[k] = { biome, seed };
    }
  }
  return { chunkSize, height, map };
}

/**
 * Merge chunk map into volume meta (additive).
 * @param {object|null|undefined} meta
 * @param {{ chunkSize?: number, height?: number, map?: Record<string, { biome: string, seed: number }> }} chunks
 */
export function writeChunkMeta(meta, chunks) {
  const prev = readChunkMeta(meta);
  const nextMap = { ...prev.map, ...(chunks.map || {}) };
  return {
    ...(meta && typeof meta === "object" ? meta : {}),
    chunks: {
      chunkSize: normalizeChunkSize(chunks.chunkSize ?? prev.chunkSize, prev.chunkSize),
      height: Math.max(4, Math.floor(Number(chunks.height ?? prev.height) || prev.height)),
      map: nextMap,
    },
  };
}

/**
 * Pick a frontier anchor: prefer (0,0), else any existing chunk.
 * @param {Record<string, unknown>} map
 */
export function pickAnchorChunk(map) {
  if (map && map["0,0"]) return { cx: 0, cz: 0 };
  const keys = map ? Object.keys(map) : [];
  if (!keys.length) return { cx: 0, cz: 0 };
  const p = parseChunkKey(keys[0]);
  return p || { cx: 0, cz: 0 };
}
