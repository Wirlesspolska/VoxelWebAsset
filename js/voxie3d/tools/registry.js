/**
 * Tool registry — single source of truth for forge tool ids, navbar items,
 * dock panel ids, and input modes.
 *
 * Navbar, left dock, and ForgeInput MUST read tool identity from here.
 * Do not hardcode parallel tool lists in UI hosts.
 *
 * Panel factories live in ui/leftDock (buildRegistryToolPanels) so tools/
 * does not import ui/.
 */

/**
 * Exclusive input modes (exactly one active for edit tools).
 * Camera-nav modifiers (Alt+LMB orbit, MMB / Shift+RMB pan, WASD) are orthogonal.
 * @typedef {'paint'|'erase'|'select'|'generate'|'stroke'|'shape'|'texturizer'|'none'|'panel'} InputMode
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   panel: string,
 *   activatesTool: string|null,
 *   inputMode: InputMode,
 *   nav: boolean,
 *   onEnable?: (api: object) => void,
 *   onDisable?: (api: object, nextId: string) => void,
 * }} ToolDef
 */

/** @type {ToolDef[]} */
export const TOOL_REGISTRY = [
  {
    id: "place",
    label: "Place",
    panel: "place",
    activatesTool: "place",
    inputMode: "paint",
    nav: true,
  },
  {
    id: "erase",
    label: "Erase",
    panel: "erase",
    activatesTool: "erase",
    inputMode: "erase",
    nav: true,
  },
  {
    id: "select",
    label: "Select",
    panel: "select",
    activatesTool: "select",
    inputMode: "select",
    nav: true,
  },
  {
    id: "shape",
    label: "Shapes",
    panel: "shape",
    activatesTool: "shape",
    inputMode: "shape",
    nav: true,
  },
  {
    id: "generate",
    label: "Generate",
    panel: "generate",
    activatesTool: "generate",
    inputMode: "generate",
    nav: true,
  },
  {
    id: "stroke",
    label: "Stroke",
    panel: "stroke",
    activatesTool: "stroke",
    inputMode: "stroke",
    nav: true,
  },
  {
    id: "texturizer",
    label: "Texturizer",
    panel: "texturizer",
    activatesTool: "texturizer",
    inputMode: "texturizer",
    nav: true,
  },
  {
    id: "groups",
    label: "Groups",
    panel: "groups",
    activatesTool: null,
    inputMode: "panel",
    nav: true,
  },
  {
    id: "brush",
    label: "Brush",
    panel: "brush",
    activatesTool: null,
    inputMode: "panel",
    nav: true,
  },
  {
    id: "history",
    label: "History",
    panel: "history",
    activatesTool: null,
    inputMode: "panel",
    nav: true,
  },
];

/** Tool ids that ForgeInput treats as exclusive edit modes (plus `none`). */
export const EXCLUSIVE_TOOL_IDS = [
  "place",
  "erase",
  "select",
  "shape",
  "generate",
  "stroke",
  "texturizer",
  "none",
];

/**
 * Scroll ownership by tool (viewport wheel).
 * | tool       | plain scroll      | Alt/Ctrl/Meta+scroll |
 * |------------|-------------------|----------------------|
 * | generate   | reroll seed only  | reroll (no zoom)     |
 * | none       | zoom              | zoom                 |
 * | other      | slice ±1          | zoom                 |
 *
 * Generate owns scroll until LMB place (exits to place) or Escape.
 */
export const SCROLL_OWNERSHIP = {
  generate: { plain: "reroll", mod: "reroll" },
  none: { plain: "zoom", mod: "zoom" },
  default: { plain: "slice", mod: "zoom" },
};

/** @type {Map<string, ToolDef>} */
const BY_ID = new Map(TOOL_REGISTRY.map((t) => [t.id, t]));

/** Navbar items derived from registry (nav:true). */
export function getToolNavItems() {
  return TOOL_REGISTRY.filter((t) => t.nav).map((t) => ({
    id: t.id,
    label: t.label,
    tool: t.activatesTool,
    panel: t.panel,
  }));
}

/** @deprecated use getToolNavItems — kept for hosts that imported TOOL_NAV_ITEMS */
export const TOOL_NAV_ITEMS = getToolNavItems();

export function getToolDef(id) {
  return BY_ID.get(id) || null;
}

export function getPanelIdForTool(toolId) {
  const def = BY_ID.get(toolId);
  if (def) return def.panel;
  return toolId === "none" ? null : toolId;
}

export function getInputMode(toolId) {
  if (toolId === "none") return "none";
  return BY_ID.get(toolId)?.inputMode || "none";
}

/**
 * Notify registry lifecycle hooks on exclusive tool change.
 * @param {object} api
 * @param {string} prevTool
 * @param {string} nextTool
 */
export function applyToolLifecycle(api, prevTool, nextTool) {
  if (prevTool === nextTool) return;
  const prev = BY_ID.get(prevTool);
  const next = BY_ID.get(nextTool);
  try {
    prev?.onDisable?.(api, nextTool);
  } catch (err) {
    console.warn("[Voxie3D] tool onDisable failed", prevTool, err);
  }
  try {
    next?.onEnable?.(api);
  } catch (err) {
    console.warn("[Voxie3D] tool onEnable failed", nextTool, err);
  }
}
