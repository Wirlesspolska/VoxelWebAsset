/**
 * Pure block-atlas metadata (no Three.js) — safe for mesh workers.
 */

/** Canonical block ids used by terrain + greedy mesh atlas UVs. */
export const BLOCK_IDS = Object.freeze([
  "grass",
  "dirt",
  "sand",
  "stone",
  "water",
  "snow",
  "lava",
  "cactus",
  "wood",
  "ice",
  "bedrock",
  "leaves",
  /** White tile — painted / unknown colors tint via vertexColors. */
  "paint",
]);

/** Stable hex colors for terrain voxels (also used as flat fallback). */
export const BLOCK_COLORS = Object.freeze({
  grass: "#5a8f3c",
  dirt: "#6b4a2e",
  sand: "#c2b280",
  stone: "#6a6e68",
  water: "#2a6fa8",
  snow: "#e8f0f8",
  lava: "#ff6a22",
  cactus: "#3d8f4a",
  wood: "#6b4a2e",
  ice: "#a8d4e8",
  bedrock: "#2a2c28",
  leaves: "#3d6b28",
  paint: "#ffffff",
});

/** Singleton helper for workers / meshing without Three materials. */
export function blockAtlasMeta() {
  const ids = [...BLOCK_IDS];
  const size = Math.ceil(Math.sqrt(ids.length));
  /** @type {Record<string, number>} */
  const materialKeyIndex = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const hex = BLOCK_COLORS[id].toLowerCase();
    materialKeyIndex[`b:${id}`] = i;
    materialKeyIndex[`c:${hex}`] = i;
  }
  materialKeyIndex["c:#3a8ec4"] = ids.indexOf("water");
  materialKeyIndex["c:#3d6b28"] = ids.indexOf("leaves");
  materialKeyIndex["c:#5a6a48"] = ids.indexOf("leaves");
  const paintIdx = ids.indexOf("paint");
  return { ids, size, materialKeyIndex, paintIndex: paintIdx >= 0 ? paintIdx : 0 };
}
