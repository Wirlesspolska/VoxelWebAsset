/**
 * Procedural Generate-shape stamps for Voxie forge.
 */

export {
  SHAPE_GEN_LIST,
  SHAPE_GEN_IDS,
  SHAPE_GEN_BY_ID,
  normalizeShapeGenId,
  shapeGenCategories,
} from "./catalog.js";

export { createShapeGenController } from "./ShapeGenController.js";

export {
  MAX_STAMP_CELLS,
  MAX_STAMP_EXTENT,
  SIZE_MIN,
  SIZE_MAX,
  clampSize,
  applyShadeMul,
  capStamp,
} from "./util.js";

export { generateBranch } from "./generators/branch.js";
export { generateRock } from "./generators/rock.js";
export { generateLeaf } from "./generators/leaf.js";
export { generateGravel } from "./generators/gravel.js";
export { generateWall } from "./generators/wall.js";
export { generateStructure, generatePillar } from "./generators/structure.js";
