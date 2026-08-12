/**
 * Holds generate-shape type, seed, and params; builds local offsets + world cells.
 */

import { normalizeShapeGenId, SHAPE_GEN_BY_ID } from "./catalog.js";
import { generateBranch } from "./generators/branch.js";
import { generateRock } from "./generators/rock.js";
import { generateLeaf } from "./generators/leaf.js";
import { generateGravel } from "./generators/gravel.js";
import { generateWall } from "./generators/wall.js";
import { generateStructure, generatePillar } from "./generators/structure.js";
import {
  applyShadeMul,
  capStamp,
  clampSize,
  MAX_STAMP_CELLS,
  MAX_STAMP_EXTENT,
  SIZE_MAX,
  SIZE_MIN,
} from "./util.js";
import { createRng } from "../world/seed.js";

/** @typedef {{x:number,y:number,z:number,shade?:number}} StampOffset */

const GENERATORS = {
  branch: generateBranch,
  rock: generateRock,
  leaf: generateLeaf,
  gravel: generateGravel,
  wall: generateWall,
  pillar: generatePillar,
  structure: generateStructure,
};

function freshSeed() {
  return (Math.random() * 0xffffffff) >>> 0 || 1;
}

/**
 * @param {{
 *   type?: string,
 *   seed?: number,
 *   size?: number,
 *   density?: number,
 *   foundationDepth?: number,
 * }} [opts]
 */
export function createShapeGenController(opts = {}) {
  let type = normalizeShapeGenId(opts.type || "branch");
  let seed = opts.seed != null ? opts.seed >>> 0 || 1 : freshSeed();
  let size = clampSize(opts.size ?? 6);
  let density = Math.max(1, Math.min(100, (opts.density ?? 70) | 0));
  let foundationDepth = Math.max(1, Math.min(6, (opts.foundationDepth ?? 2) | 0));

  /** @type {StampOffset[]|null} */
  let cached = null;
  let cacheKey = "";

  function paramsKey() {
    return `${type}|${seed}|${size}|${density}|${foundationDepth}`;
  }

  function invalidate() {
    cached = null;
    cacheKey = "";
  }

  function getParams() {
    return {
      type,
      seed,
      size,
      density,
      foundationDepth,
      label: SHAPE_GEN_BY_ID[type]?.label || type,
      /** Stable id used for auto group names: `{propName} #N`. */
      propName: type,
      category: SHAPE_GEN_BY_ID[type]?.category || "",
      usesFoundation: !!SHAPE_GEN_BY_ID[type]?.usesFoundation,
      maxExtent: MAX_STAMP_EXTENT,
      maxCells: MAX_STAMP_CELLS,
      sizeMin: SIZE_MIN,
      sizeMax: SIZE_MAX,
    };
  }

  /** Shape id for stamp group naming (`branch`, `rock`, …). */
  function propName() {
    return type;
  }

  /** Build / return capped local offsets for current params. */
  function getOffsets() {
    const key = paramsKey();
    if (cached && cacheKey === key) return cached;
    const gen = GENERATORS[type] || generateBranch;
    const raw = gen({ seed, size, density, foundationDepth });
    cached = capStamp(raw, { maxCells: MAX_STAMP_CELLS, maxExtent: MAX_STAMP_EXTENT });
    cacheKey = key;
    return cached;
  }

  /**
   * World cells at cursor (keeps optional shade for place tint).
   * @param {{x:number,y:number,z:number}} origin
   */
  function cellsAt(origin) {
    if (!origin) return [];
    const ox = origin.x | 0;
    const oy = origin.y | 0;
    const oz = origin.z | 0;
    return getOffsets().map((o) => {
      const c = { x: ox + o.x, y: oy + o.y, z: oz + o.z };
      if (o.shade != null) c.shade = o.shade;
      return c;
    });
  }

  /**
   * Preview cells (positions only — ghost uses brush color).
   * @param {{x:number,y:number,z:number}} origin
   */
  function previewCellsAt(origin) {
    return cellsAt(origin).map((c) => ({ x: c.x, y: c.y, z: c.z }));
  }

  /**
   * Place cells with shade baked into color when mul present.
   * @param {{x:number,y:number,z:number}} origin
   * @param {(x:number,y:number,z:number)=>string} resolveColor
   */
  function placeCellsAt(origin, resolveColor) {
    return cellsAt(origin).map((c) => {
      let color = resolveColor(c.x, c.y, c.z);
      if (c.shade != null) color = applyShadeMul(color, c.shade);
      return { x: c.x, y: c.y, z: c.z, color };
    });
  }

  function setType(id) {
    type = normalizeShapeGenId(id);
    invalidate();
    return type;
  }

  function setSeed(n) {
    seed = (Number(n) >>> 0) || 1;
    invalidate();
    return seed;
  }

  function setSize(n) {
    size = clampSize(n);
    invalidate();
    return size;
  }

  function setDensity(n) {
    density = Math.max(1, Math.min(100, n | 0));
    invalidate();
    return density;
  }

  function setFoundationDepth(n) {
    foundationDepth = Math.max(1, Math.min(6, n | 0));
    invalidate();
    return foundationDepth;
  }

  /** New variant seed (scroll reroll). Does not change type/size. */
  function reroll() {
    const rng = createRng((seed ^ 0x9e3779b9) >>> 0 || 1);
    seed = (Math.floor(rng.next() * 0xffffffff) ^ (performance.now() | 0)) >>> 0 || 1;
    invalidate();
    return seed;
  }

  function setParams(opts = {}) {
    if (opts.type != null) setType(opts.type);
    if (opts.seed != null) setSeed(opts.seed);
    if (opts.size != null) setSize(opts.size);
    if (opts.density != null) setDensity(opts.density);
    if (opts.foundationDepth != null) setFoundationDepth(opts.foundationDepth);
    return getParams();
  }

  return {
    getParams,
    propName,
    getOffsets,
    cellsAt,
    previewCellsAt,
    placeCellsAt,
    setType,
    setSeed,
    setSize,
    setDensity,
    setFoundationDepth,
    setParams,
    reroll,
    get type() {
      return type;
    },
    get seed() {
      return seed;
    },
  };
}
