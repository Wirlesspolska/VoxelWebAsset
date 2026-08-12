/**
 * Biome definitions driving per-chunk terrain params.
 * Keep fauna sparse — optional marker voxels only (potato-friendly).
 */

import { BLOCK_COLORS } from "../materials/blockAtlasMeta.js";

/** @typedef {'greenery'|'lava'|'pond'|'ocean'|'highland'|'desert'|'snow'|'mountain'|'iceberg'} BiomeId */

/**
 * @typedef {object} BiomeDef
 * @property {BiomeId} id
 * @property {string} label
 * @property {string} previewHex outline / UI accent
 * @property {number} amplitude height variation in blocks
 * @property {number} seaLevel 0..1 fill bias into column height
 * @property {number} dirtDepth
 * @property {boolean} caves
 * @property {number} [columnDepth]
 * @property {number} [heightBoost] extra Y extent request vs base height
 * @property {number} [waterFill] fill water/lava up to this fraction of height below surface
 * @property {'none'|'water'|'lava'|'ice'} [fluid]
 * @property {number} [treeChance] sparse greenery props
 * @property {number} [cactusChance]
 * @property {number} [icebergChance]
 * @property {number} [faunaChance] bat/bird stub chance per column
 * @property {string} [fogHex] lightweight biome tint / fog hint (future shader effects)
 * @property {number} [fogDensity] 0..1 soft density hint
 * @property {{ grass:string, dirt:string, stone:string, bedrock:string, fluid?:string, fauna?:string, accent?:string, wood?:string, leaves?:string, cactus?:string, snow?:string, sand?:string }} colors
 * @property {{ grass?:string, dirt?:string, stone?:string, bedrock?:string, fluid?:string, accent?:string, wood?:string, leaves?:string, cactus?:string }} [blocks]
 */

/** @type {Record<BiomeId, BiomeDef>} */
export const BIOMES = Object.freeze({
  greenery: {
    id: "greenery",
    label: "Forest / greenery",
    previewHex: "#6db84a",
    amplitude: 5,
    seaLevel: 0.38,
    dirtDepth: 3,
    caves: true,
    columnDepth: 10,
    heightBoost: 0,
    fluid: "none",
    treeChance: 0.045,
    faunaChance: 0.012,
    fogHex: "#8ab878",
    fogDensity: 0.08,
    colors: {
      grass: BLOCK_COLORS.grass,
      dirt: BLOCK_COLORS.dirt,
      stone: BLOCK_COLORS.stone,
      bedrock: BLOCK_COLORS.bedrock,
      accent: BLOCK_COLORS.wood,
      wood: BLOCK_COLORS.wood,
      leaves: BLOCK_COLORS.leaves,
      fauna: "#c8d4e0",
    },
    blocks: {
      grass: "grass",
      dirt: "dirt",
      stone: "stone",
      bedrock: "bedrock",
      accent: "wood",
      wood: "wood",
      leaves: "leaves",
    },
  },
  lava: {
    id: "lava",
    label: "Lava",
    previewHex: "#e85a24",
    amplitude: 4,
    seaLevel: 0.28,
    dirtDepth: 2,
    caves: true,
    columnDepth: 9,
    heightBoost: 0,
    waterFill: 0.22,
    fluid: "lava",
    treeChance: 0,
    faunaChance: 0.004,
    fogHex: "#c45a28",
    fogDensity: 0.12,
    colors: {
      grass: "#4a3a32",
      dirt: "#5a3428",
      stone: "#3a3230",
      bedrock: BLOCK_COLORS.bedrock,
      fluid: BLOCK_COLORS.lava,
      fauna: "#ffaa44",
    },
    blocks: {
      grass: "stone",
      dirt: "stone",
      stone: "stone",
      bedrock: "bedrock",
      fluid: "lava",
    },
  },
  pond: {
    id: "pond",
    label: "Water ponds",
    previewHex: "#3a9ec9",
    amplitude: 3,
    seaLevel: 0.42,
    dirtDepth: 3,
    caves: false,
    columnDepth: 8,
    heightBoost: 0,
    waterFill: 0.35,
    fluid: "water",
    treeChance: 0.025,
    faunaChance: 0.01,
    fogHex: "#6aa8c8",
    fogDensity: 0.1,
    colors: {
      grass: BLOCK_COLORS.grass,
      dirt: BLOCK_COLORS.dirt,
      stone: BLOCK_COLORS.stone,
      bedrock: BLOCK_COLORS.bedrock,
      fluid: "#3a8ec4",
      wood: BLOCK_COLORS.wood,
      leaves: BLOCK_COLORS.leaves,
      fauna: "#e8f0ff",
    },
    blocks: {
      grass: "grass",
      dirt: "dirt",
      stone: "stone",
      bedrock: "bedrock",
      fluid: "water",
      wood: "wood",
      leaves: "leaves",
    },
  },
  ocean: {
    id: "ocean",
    label: "Ocean",
    previewHex: "#2a6fa8",
    amplitude: 2,
    seaLevel: 0.55,
    dirtDepth: 2,
    caves: false,
    columnDepth: 7,
    heightBoost: 0,
    waterFill: 0.7,
    fluid: "water",
    treeChance: 0,
    faunaChance: 0.006,
    fogHex: "#3a7aaa",
    fogDensity: 0.14,
    colors: {
      grass: BLOCK_COLORS.sand,
      dirt: "#8a7a58",
      stone: "#5a6570",
      bedrock: "#1e2430",
      fluid: BLOCK_COLORS.water,
      fauna: "#a8d4ff",
    },
    blocks: {
      grass: "sand",
      dirt: "sand",
      stone: "stone",
      bedrock: "bedrock",
      fluid: "water",
    },
  },
  highland: {
    id: "highland",
    label: "Highland (taller)",
    previewHex: "#a8b89a",
    amplitude: 10,
    seaLevel: 0.48,
    dirtDepth: 2,
    caves: true,
    columnDepth: 14,
    heightBoost: 16,
    fluid: "none",
    treeChance: 0.02,
    faunaChance: 0.02,
    fogHex: "#a0b090",
    fogDensity: 0.1,
    colors: {
      grass: "#7a8f5c",
      dirt: "#6b5a3e",
      stone: "#7a7e78",
      bedrock: BLOCK_COLORS.bedrock,
      accent: "#5a6a48",
      wood: BLOCK_COLORS.wood,
      leaves: BLOCK_COLORS.leaves,
      fauna: "#dde6f0",
    },
    blocks: {
      grass: "grass",
      dirt: "dirt",
      stone: "stone",
      bedrock: "bedrock",
      wood: "wood",
      leaves: "leaves",
    },
  },
  desert: {
    id: "desert",
    label: "Desert + cacti",
    previewHex: "#d2b48c",
    amplitude: 3,
    seaLevel: 0.32,
    dirtDepth: 2,
    caves: false,
    columnDepth: 8,
    heightBoost: 0,
    fluid: "none",
    treeChance: 0,
    cactusChance: 0.035,
    faunaChance: 0.004,
    fogHex: "#e0c898",
    fogDensity: 0.06,
    colors: {
      grass: BLOCK_COLORS.sand,
      dirt: BLOCK_COLORS.sand,
      stone: BLOCK_COLORS.stone,
      bedrock: BLOCK_COLORS.bedrock,
      cactus: BLOCK_COLORS.cactus,
      fauna: "#e8d4a8",
    },
    blocks: {
      grass: "sand",
      dirt: "sand",
      stone: "stone",
      bedrock: "bedrock",
      cactus: "cactus",
    },
  },
  snow: {
    id: "snow",
    label: "Snow plains",
    previewHex: "#e8f0f8",
    amplitude: 4,
    seaLevel: 0.4,
    dirtDepth: 2,
    caves: true,
    columnDepth: 9,
    heightBoost: 0,
    fluid: "none",
    treeChance: 0.015,
    faunaChance: 0.008,
    fogHex: "#c8d8e8",
    fogDensity: 0.16,
    colors: {
      grass: BLOCK_COLORS.snow,
      dirt: BLOCK_COLORS.dirt,
      stone: BLOCK_COLORS.stone,
      bedrock: BLOCK_COLORS.bedrock,
      snow: BLOCK_COLORS.snow,
      wood: BLOCK_COLORS.wood,
      leaves: "#a8c8b0",
      fauna: "#ffffff",
    },
    blocks: {
      grass: "snow",
      dirt: "dirt",
      stone: "stone",
      bedrock: "bedrock",
      wood: "wood",
      leaves: "leaves",
    },
  },
  mountain: {
    id: "mountain",
    label: "Mountains",
    previewHex: "#8a9088",
    amplitude: 14,
    seaLevel: 0.52,
    dirtDepth: 1,
    caves: true,
    columnDepth: 18,
    heightBoost: 24,
    fluid: "none",
    treeChance: 0.008,
    faunaChance: 0.015,
    fogHex: "#9aa0a8",
    fogDensity: 0.12,
    colors: {
      grass: "#6a7a58",
      dirt: BLOCK_COLORS.stone,
      stone: BLOCK_COLORS.stone,
      bedrock: BLOCK_COLORS.bedrock,
      snow: BLOCK_COLORS.snow,
      wood: BLOCK_COLORS.wood,
      leaves: BLOCK_COLORS.leaves,
      fauna: "#dde6f0",
    },
    blocks: {
      grass: "stone",
      dirt: "stone",
      stone: "stone",
      bedrock: "bedrock",
      snow: "snow",
      wood: "wood",
      leaves: "leaves",
    },
  },
  iceberg: {
    id: "iceberg",
    label: "Icebergs",
    previewHex: "#a8d4e8",
    amplitude: 6,
    seaLevel: 0.5,
    dirtDepth: 1,
    caves: false,
    columnDepth: 10,
    heightBoost: 8,
    waterFill: 0.55,
    fluid: "water",
    treeChance: 0,
    icebergChance: 0.08,
    faunaChance: 0.005,
    fogHex: "#90b8d0",
    fogDensity: 0.18,
    colors: {
      grass: BLOCK_COLORS.ice,
      dirt: BLOCK_COLORS.ice,
      stone: BLOCK_COLORS.stone,
      bedrock: "#1e2430",
      fluid: BLOCK_COLORS.water,
      snow: BLOCK_COLORS.snow,
      fauna: "#e8f4ff",
    },
    blocks: {
      grass: "ice",
      dirt: "ice",
      stone: "stone",
      bedrock: "bedrock",
      fluid: "water",
      snow: "snow",
    },
  },
});

export const BIOME_IDS = Object.freeze(Object.keys(BIOMES));

/**
 * @param {string} [id]
 * @returns {BiomeDef}
 */
export function getBiome(id) {
  const key = typeof id === "string" ? id.toLowerCase() : "greenery";
  return BIOMES[key] || BIOMES.greenery;
}

/**
 * Terrain opts derived from biome (+ optional overrides).
 * @param {string|BiomeDef} biome
 * @param {object} [overrides]
 */
export function biomeTerrainOpts(biome, overrides = {}) {
  const def = typeof biome === "string" ? getBiome(biome) : biome || BIOMES.greenery;
  return {
    biomeId: def.id,
    amplitude: def.amplitude,
    seaLevel: def.seaLevel,
    dirtDepth: def.dirtDepth,
    caves: def.caves,
    columnDepth: def.columnDepth,
    heightBoost: def.heightBoost || 0,
    waterFill: def.waterFill ?? 0,
    fluid: def.fluid || "none",
    treeChance: def.treeChance ?? 0,
    cactusChance: def.cactusChance ?? 0,
    icebergChance: def.icebergChance ?? 0,
    faunaChance: def.faunaChance ?? 0,
    fogHex: def.fogHex || null,
    fogDensity: def.fogDensity ?? 0,
    colors: { ...def.colors },
    blocks: { ...(def.blocks || {}) },
    ...overrides,
  };
}
