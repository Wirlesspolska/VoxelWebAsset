/**
 * Tool ids and brush helpers for Voxie forge.
 * Exclusive tool id list aligns with tools/registry.js (EXCLUSIVE_TOOL_IDS).
 * Brush footprints live in brushes.js; shapes in shapes.js.
 */

export { BRUSH_PRESETS, paintBrushCells, rectBrushCells, circleBrushCells, brushCells } from "./brushes.js";
export { SHAPE_IDS, SHAPE_BUILDERS, shapeCells, DIAMOND_MIN } from "./shapes.js";
export {
  STROKE_DIRS,
  strokeCellsStraight,
  strokeCellsSmooth,
  strokeDirectionGhosts,
  pickStrokeDirection,
  normalizeStrokeLength,
} from "./stroke.js";
export {
  TOOL_REGISTRY,
  EXCLUSIVE_TOOL_IDS,
  SCROLL_OWNERSHIP,
  getToolNavItems,
  getToolDef,
  getInputMode,
  applyToolLifecycle,
} from "./registry.js";

/** @typedef {'place'|'erase'|'none'|'select'|'stroke'|'shape'|'texturizer'|'generate'} ToolId */

/** Exclusive edit tools (+ none). Panel-only nav ids are not tools. */
export const TOOLS = [
  "place",
  "erase",
  "none",
  "select",
  "stroke",
  "shape",
  "texturizer",
  "generate",
];

export function normalizeTool(tool) {
  return TOOLS.includes(tool) ? tool : "none";
}

