/**
 * Seeded Minecraft-like heightmap + layered dirt/stone + optional caves.
 * Operates on a VoxelGrid (or any object with worldSize / set / clear / setSeed).
 * Clarification: prefer generateTerrainChunk / iterateChunkColumns for ongoing growth.
 */

import { createRng, hashSeed } from "./seed.js";
import { biomeTerrainOpts, getBiome } from "./biomes.js";
import { chunkBounds, normalizeChunkSize } from "./chunks.js";
import { BLOCK_COLORS } from "../materials/blockAtlasMeta.js";

export const TERRAIN_COLORS = {
  grass: BLOCK_COLORS.grass,
  dirt: BLOCK_COLORS.dirt,
  stone: BLOCK_COLORS.stone,
  bedrock: BLOCK_COLORS.bedrock,
  sand: BLOCK_COLORS.sand,
  snow: BLOCK_COLORS.snow,
  water: BLOCK_COLORS.water,
  lava: BLOCK_COLORS.lava,
  wood: BLOCK_COLORS.wood,
  leaves: BLOCK_COLORS.leaves,
  cactus: BLOCK_COLORS.cactus,
  ice: BLOCK_COLORS.ice,
};

/**
 * Value-noise helpers (hash lattice → smooth-ish height / cave density).
 */
function hash2(ix, iz, salt) {
  let n = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ (salt >>> 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function hash3(ix, iy, iz, salt) {
  let n =
    Math.imul(ix | 0, 374761393) ^
    Math.imul(iy | 0, 668265263) ^
    Math.imul(iz | 0, 2147483647) ^
    (salt >>> 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise2(x, z, salt) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, salt);
  const b = hash2(x0 + 1, z0, salt);
  const c = hash2(x0, z0 + 1, salt);
  const d = hash2(x0 + 1, z0 + 1, salt);
  const u = a + (b - a) * sx;
  const v = c + (d - c) * sx;
  return u + (v - u) * sz;
}

function fbm2(x, z, salt, octaves = 4) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += smoothNoise2(x * freq, z * freq, salt + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * @param {object} opts
 */
function resolveTerrainParams(volume, seed, opts = {}) {
  const useBiome = opts.biome != null && opts.biome !== "";
  const biomeOpts = useBiome ? biomeTerrainOpts(opts.biome, opts) : null;

  const resolvedSeed =
    Number.isFinite(seed)
      ? seed >>> 0
      : Number.isFinite(volume.seed)
        ? volume.seed
        : hashSeed("voxie-world", Date.now());

  const ws = volume.worldSize || { x: volume.size, y: volume.size, z: volume.size };
  const halfY = Math.floor(ws.y / 2);

  const colors = { ...TERRAIN_COLORS, ...(biomeOpts?.colors || opts.colors || {}) };
  const blocks = {
    grass: "grass",
    dirt: "dirt",
    stone: "stone",
    bedrock: "bedrock",
    fluid: "water",
    wood: "wood",
    leaves: "leaves",
    cactus: "cactus",
    snow: "snow",
    sand: "sand",
    ice: "ice",
    ...(biomeOpts?.blocks || opts.blocks || {}),
  };
  const caves = biomeOpts ? biomeOpts.caves !== false : opts.caves !== false;
  const dirtDepth = Math.max(1, biomeOpts?.dirtDepth ?? opts.dirtDepth ?? 3);
  const columnDepth = Math.max(
    dirtDepth + 2,
    biomeOpts?.columnDepth ?? opts.columnDepth ?? Math.min(ws.y - 2, dirtDepth + 8)
  );
  const amplitude = Math.max(
    1,
    biomeOpts?.amplitude ?? opts.amplitude ?? Math.max(3, Math.floor(ws.y * 0.28))
  );
  const seaBias = Number.isFinite(biomeOpts?.seaLevel)
    ? biomeOpts.seaLevel
    : Number.isFinite(opts.seaLevel)
      ? opts.seaLevel
      : null;
  const baseHeight = Number.isFinite(seaBias)
    ? Math.floor(-halfY + 1 + (ws.y - 2) * Math.min(1, Math.max(0, seaBias)))
    : -halfY + Math.floor(ws.y * 0.35);
  const partId = typeof opts.partId === "string" ? opts.partId : "terrain";
  const fluid = biomeOpts?.fluid || opts.fluid || "none";
  const waterFill = Math.max(0, Math.min(1, biomeOpts?.waterFill ?? opts.waterFill ?? 0));
  const treeChance = biomeOpts?.treeChance ?? opts.treeChance ?? 0;
  const cactusChance = biomeOpts?.cactusChance ?? opts.cactusChance ?? 0;
  const icebergChance = biomeOpts?.icebergChance ?? opts.icebergChance ?? 0;
  const faunaChance = biomeOpts?.faunaChance ?? opts.faunaChance ?? 0;
  const fogHex = biomeOpts?.fogHex ?? opts.fogHex ?? null;
  const fogDensity = biomeOpts?.fogDensity ?? opts.fogDensity ?? 0;
  const biomeId = biomeOpts?.biomeId || "greenery";
  const saltH = hashSeed(resolvedSeed, "height", useBiome ? biomeId : "classic");
  const saltC = hashSeed(resolvedSeed, "cave", useBiome ? biomeId : "classic");
  const saltP = hashSeed(resolvedSeed, "props", useBiome ? biomeId : "classic");
  const scale = 1 / Math.max(8, Math.min(ws.x, ws.z) * 0.22);

  return {
    resolvedSeed,
    halfY,
    ws,
    colors,
    blocks,
    caves,
    dirtDepth,
    columnDepth,
    amplitude,
    baseHeight,
    partId,
    fluid,
    waterFill,
    treeChance,
    cactusChance,
    icebergChance,
    faunaChance,
    fogHex,
    fogDensity,
    saltH,
    saltC,
    saltP,
    scale,
    biomeId,
  };
}

/**
 * Fill one (x,z) column. Returns list of placed cells for dirty sync.
 * @param {import('../core/VoxelGrid.js').VoxelGrid} volume
 * @param {number} x
 * @param {number} z
 * @param {ReturnType<typeof resolveTerrainParams>} p
 * @param {{ expand?: boolean }} [flags]
 * @returns {{ x:number, y:number, z:number }[]}
 */
export function fillTerrainColumn(volume, x, z, p, flags = {}) {
  const touched = [];
  const setCell = (cx, cy, cz, color, block) => {
    if (flags.expand && typeof volume.expandToInclude === "function") {
      volume.expandToInclude(cx, cy, cz);
    }
    const payload = block ? { color, partId: p.partId, block } : color;
    if (volume.set(cx, cy, cz, payload, p.partId)) {
      touched.push({ x: cx, y: cy, z: cz });
      return true;
    }
    return false;
  };

  const n = fbm2(x * p.scale, z * p.scale, p.saltH, 4);
  let surface = Math.floor(p.baseHeight + (n - 0.5) * 2 * p.amplitude);
  surface = Math.max(-p.halfY + 1, Math.min(p.halfY - 1, surface));

  // Mountain snow caps / iceberg taller ice pillars.
  const snowLine =
    p.biomeId === "mountain"
      ? p.baseHeight + Math.floor(p.amplitude * 0.55)
      : p.biomeId === "snow"
        ? surface - 99
        : Infinity;

  const yMin = Math.max(-p.halfY, surface - p.columnDepth);
  if (yMin > -p.halfY) {
    setCell(x, -p.halfY, z, p.colors.bedrock, p.blocks.bedrock);
  }

  for (let y = yMin; y <= surface; y++) {
    if (p.caves && y > yMin && y < surface - 1) {
      const d = hash3(x, y, z, p.saltC);
      const caveN = fbm2(x * 0.12 + y * 0.05, z * 0.12 - y * 0.04, p.saltC, 3);
      if (d > 0.62 && caveN > 0.55) continue;
    }

    let color = p.colors.stone;
    let block = p.blocks.stone;
    if (y === -p.halfY) {
      color = p.colors.bedrock;
      block = p.blocks.bedrock;
    } else if (y === surface) {
      if (y >= snowLine || p.biomeId === "snow") {
        color = p.colors.snow || p.colors.grass;
        block = p.blocks.snow || "snow";
      } else {
        color = p.colors.grass;
        block = p.blocks.grass;
      }
    } else if (y >= surface - p.dirtDepth) {
      color = p.colors.dirt;
      block = p.blocks.dirt;
    }

    setCell(x, y, z, color, block);
  }

  // Fluid pools / ocean fill above solid surface toward a local water table.
  if (p.fluid !== "none" && p.waterFill > 0 && p.colors.fluid) {
    const basin = fbm2(x * 0.08, z * 0.08, p.saltP, 3);
    const wantPool =
      p.fluid === "lava" ? basin > 0.42 : p.biomeId === "iceberg" ? basin > 0.4 : basin > 0.48;
    if (wantPool || p.biomeId === "ocean" || p.biomeId === "iceberg") {
      const waterTop = Math.min(
        p.halfY - 1,
        Math.floor(
          p.baseHeight +
            p.amplitude *
              (p.biomeId === "ocean" || p.biomeId === "iceberg" ? 0.35 : 0.1)
        )
      );
      const fillFrom = surface + 1;
      const maxFill = Math.floor(p.waterFill * (p.ws.y * 0.5));
      let filled = 0;
      const fluidBlock = p.blocks.fluid || (p.fluid === "lava" ? "lava" : "water");
      for (let y = fillFrom; y <= waterTop && filled < maxFill; y++) {
        if (volume.has?.(x, y, z)) continue;
        setCell(x, y, z, p.colors.fluid, fluidBlock);
        filled++;
      }
    }
  }

  // Trees — short trunk + leaf blob (greenery / pond / highland / snow / mountain).
  if (p.treeChance > 0 && hash2(x, z, p.saltP) < p.treeChance) {
    const trunkH = 3 + Math.floor(hash2(x, z, p.saltP + 1) * 3);
    const wood = p.colors.wood || p.colors.accent || p.colors.dirt;
    const leaves = p.colors.leaves || p.colors.accent || p.colors.grass;
    const woodBlock = p.blocks.wood || "wood";
    const leafBlock = p.blocks.leaves || "leaves";
    for (let i = 1; i <= trunkH; i++) {
      const ty = surface + i;
      if (ty >= p.halfY) break;
      if (!volume.has?.(x, ty, z)) setCell(x, ty, z, wood, woodBlock);
    }
    const top = surface + trunkH;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 0; dy <= 1; dy++) {
          if (Math.abs(dx) + Math.abs(dz) + dy > 2) continue;
          const lx = x + dx;
          const ly = top + dy;
          const lz = z + dz;
          if (ly >= p.halfY) continue;
          if (!volume.has?.(lx, ly, lz)) setCell(lx, ly, lz, leaves, leafBlock);
        }
      }
    }
  }

  // Desert cacti — 2–4 tall green column.
  if (p.cactusChance > 0 && hash2(x, z, p.saltP + 7) < p.cactusChance) {
    const h = 2 + Math.floor(hash2(x, z, p.saltP + 8) * 3);
    const cactus = p.colors.cactus || BLOCK_COLORS.cactus;
    for (let i = 1; i <= h; i++) {
      const ty = surface + i;
      if (ty >= p.halfY) break;
      if (!volume.has?.(x, ty, z)) setCell(x, ty, z, cactus, p.blocks.cactus || "cactus");
    }
  }

  // Iceberg pillars — chunky ice above water table.
  if (p.icebergChance > 0 && hash2(x, z, p.saltP + 11) < p.icebergChance) {
    const h = 4 + Math.floor(hash2(x, z, p.saltP + 12) * 6);
    const ice = p.colors.grass || BLOCK_COLORS.ice;
    for (let i = 1; i <= h; i++) {
      const ty = surface + i;
      if (ty >= p.halfY) break;
      if (!volume.has?.(x, ty, z)) setCell(x, ty, z, ice, p.blocks.ice || "ice");
      if (i > 2 && hash2(x + i, z, p.saltP) > 0.55) {
        if (!volume.has?.(x + 1, ty, z)) setCell(x + 1, ty, z, ice, "ice");
        if (!volume.has?.(x, ty, z + 1)) setCell(x, ty, z + 1, ice, "ice");
      }
    }
  }

  // Ambient fauna stubs — single light voxel above surface (bat/bird marker).
  if (p.faunaChance > 0 && hash2(x + 17, z - 9, p.saltP) < p.faunaChance) {
    const fy = Math.min(p.halfY - 1, surface + 3 + Math.floor(hash2(x, z, p.saltP + 3) * 4));
    if (fy > surface && !volume.has?.(x, fy, z)) {
      setCell(x, fy, z, p.colors.fauna || "#c8d4e0", null);
    }
  }

  return touched;
}

/**
 * Column iterator for batched chunk fill (potato-friendly).
 * @param {number} cx
 * @param {number} cz
 * @param {number} chunkSize
 * @param {number} height
 * @returns {{ x:number, z:number }[]}
 */
export function listChunkColumns(cx, cz, chunkSize, height) {
  const b = chunkBounds(cx, cz, chunkSize, height);
  /** @type {{ x:number, z:number }[]} */
  const cols = [];
  for (let x = b.minX; x < b.maxX; x++) {
    for (let z = b.minZ; z < b.maxZ; z++) {
      cols.push({ x, z });
    }
  }
  return cols;
}

/**
 * Generate one chunk into the volume (does not clear other chunks).
 * Expands bounds to include the chunk AABB when volume.expandToInclude exists.
 *
 * @param {import('../core/VoxelGrid.js').VoxelGrid} volume
 * @param {number} [seed]
 * @param {object} [opts]
 * @param {number} [opts.cx=0]
 * @param {number} [opts.cz=0]
 * @param {number} [opts.chunkSize]
 * @param {string} [opts.biome='greenery']
 * @param {boolean} [opts.expand=true]
 * @returns {{ seed:number, voxelCount:number, cx:number, cz:number, biome:string, columns:number }}
 */
export function generateTerrainChunk(volume, seed, opts = {}) {
  if (!volume || typeof volume.set !== "function") {
    throw new Error("generateTerrainChunk: volume with set() required");
  }

  const cx = opts.cx | 0;
  const cz = opts.cz | 0;
  const ws = volume.worldSize || { x: volume.size, y: volume.size, z: volume.size };
  const chunkSize = normalizeChunkSize(opts.chunkSize ?? Math.min(ws.x, ws.z), 32);
  const height = Math.max(4, opts.height ?? ws.y);
  const biomeId = getBiome(opts.biome).id;

  // Expand Y for highland before column math (halfY depends on worldSize.y).
  const boost = getBiome(biomeId).heightBoost || 0;
  if (boost > 0 && typeof volume.setWorldSize === "function") {
    const needY = height + boost;
    if (ws.y < needY) {
      volume.setWorldSize({ x: ws.x, y: needY, z: ws.z });
    }
  }

  const b = chunkBounds(cx, cz, chunkSize, volume.worldSize?.y ?? height);
  if (opts.expand !== false && typeof volume.expandToInclude === "function") {
    volume.expandToInclude(b.minX, b.minY, b.minZ);
    volume.expandToInclude(b.maxX - 1, b.maxY - 1, b.maxZ - 1);
  }

  const p = resolveTerrainParams(volume, seed, { ...opts, biome: biomeId });
  if (typeof volume.setSeed === "function") volume.setSeed(p.resolvedSeed);
  if (typeof volume.setMode === "function") volume.setMode("world");
  if (typeof volume.setPartId === "function") volume.setPartId(p.partId);

  let voxelCount = 0;
  const columns = listChunkColumns(cx, cz, chunkSize, volume.worldSize?.y ?? height);
  for (const col of columns) {
    const touched = fillTerrainColumn(volume, col.x, col.z, p, { expand: opts.expand !== false });
    voxelCount += touched.length;
  }

  return {
    seed: p.resolvedSeed,
    voxelCount,
    cx,
    cz,
    biome: biomeId,
    columns: columns.length,
  };
}

/**
 * Generate terrain into `volume` (VoxelGrid).
 * Backward-compatible: clears volume and fills origin chunk (0,0) sized to world XZ.
 * @param {import('../core/VoxelGrid.js').VoxelGrid} volume
 * @param {number} [seed]
 * @param {object} [opts]
 * @param {boolean} [opts.caves=true]
 * @param {number} [opts.dirtDepth=3]
 * @param {number} [opts.seaLevel] relative fill bias (0..1 of height)
 * @param {number} [opts.amplitude] height variation in blocks
 * @param {boolean} [opts.clear=true]
 * @param {string} [opts.partId='terrain']
 * @param {string} [opts.biome]
 * @returns {{ seed:number, voxelCount:number, cx:number, cz:number, biome:string }}
 */
export function generateTerrain(volume, seed, opts = {}) {
  if (!volume || typeof volume.set !== "function") {
    throw new Error("generateTerrain: volume with set() required");
  }

  if (opts.clear !== false && typeof volume.clear === "function") {
    volume.clear();
  }

  const ws = volume.worldSize || { x: volume.size, y: volume.size, z: volume.size };
  const chunkSize = normalizeChunkSize(opts.chunkSize ?? Math.min(ws.x, ws.z), 32);

  // Legacy full-volume fill when chunkSize covers entire footprint and no biome chunk mode.
  if (opts.fullVolume === true || (opts.chunkSize == null && opts.biome == null && opts.cx == null)) {
    // Keep classic path: fill entire current bounds (not only one chunk).
    const p = resolveTerrainParams(volume, seed, opts);
    void createRng(p.resolvedSeed);

    if (typeof volume.setSeed === "function") volume.setSeed(p.resolvedSeed);
    if (typeof volume.setMode === "function") volume.setMode("world");
    if (typeof volume.setPartId === "function") volume.setPartId(p.partId);

    const halfX = Math.floor(ws.x / 2);
    const halfZ = Math.floor(ws.z / 2);
    let voxelCount = 0;
    for (let x = -halfX; x < halfX; x++) {
      for (let z = -halfZ; z < halfZ; z++) {
        voxelCount += fillTerrainColumn(volume, x, z, p).length;
      }
    }
    return {
      seed: p.resolvedSeed,
      voxelCount,
      cx: 0,
      cz: 0,
      biome: p.biomeId,
    };
  }

  return generateTerrainChunk(volume, seed, {
    ...opts,
    cx: opts.cx ?? 0,
    cz: opts.cz ?? 0,
    chunkSize,
    expand: false,
  });
}

/**
 * Build shared params for a batch job (one chunk).
 * Call once, then fillTerrainColumn per column.
 */
export function createChunkTerrainContext(volume, seed, opts = {}) {
  const biomeId = getBiome(opts.biome).id;
  const p = resolveTerrainParams(volume, seed, { ...opts, biome: biomeId });
  if (typeof volume.setSeed === "function") volume.setSeed(p.resolvedSeed);
  if (typeof volume.setMode === "function") volume.setMode("world");
  if (typeof volume.setPartId === "function") volume.setPartId(p.partId);
  return p;
}
