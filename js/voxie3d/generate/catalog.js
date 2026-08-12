/**
 * Generate-shape catalog — Nature + Build categories.
 */

/** @typedef {{ id: string, label: string, category: 'Nature'|'Build', usesFoundation?: boolean }} ShapeGenEntry */

/** @type {ShapeGenEntry[]} */
export const SHAPE_GEN_LIST = [
  { id: "branch", label: "Branch", category: "Nature" },
  { id: "rock", label: "Stone / rock", category: "Nature" },
  { id: "leaf", label: "Leaf cluster", category: "Nature" },
  { id: "gravel", label: "Gravel patch", category: "Nature" },
  { id: "wall", label: "Wall segment", category: "Build" },
  { id: "pillar", label: "Pillar", category: "Build", usesFoundation: true },
  {
    id: "structure",
    label: "Foundation + floors",
    category: "Build",
    usesFoundation: true,
  },
];

export const SHAPE_GEN_IDS = SHAPE_GEN_LIST.map((e) => e.id);

/** @type {Record<string, ShapeGenEntry>} */
export const SHAPE_GEN_BY_ID = Object.fromEntries(SHAPE_GEN_LIST.map((e) => [e.id, e]));

/**
 * @param {string} id
 * @returns {string}
 */
export function normalizeShapeGenId(id) {
  return SHAPE_GEN_BY_ID[id] ? id : "branch";
}

/**
 * @returns {{ category: string, items: ShapeGenEntry[] }[]}
 */
export function shapeGenCategories() {
  /** @type {Map<string, ShapeGenEntry[]>} */
  const map = new Map();
  for (const e of SHAPE_GEN_LIST) {
    if (!map.has(e.category)) map.set(e.category, []);
    map.get(e.category).push(e);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}
