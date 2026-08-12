/**
 * Layer visibility helpers.
 * Modes: 'all' | 'active' | 'base+active'
 */

export const LAYER_MODES = ["all", "active", "base+active"];

/**
 * @returns {'full'|'ghost'|'hidden'}
 */
export function classifyVoxelVisibility(v, { axis, slice, baseSlice, mode, isolatePart, partId }) {
  if (isolatePart && v.partId != null && v.partId !== partId) {
    return "hidden";
  }

  const coord = v[axis];
  if (mode === "all") return "full";
  if (mode === "active") return coord === slice ? "full" : "hidden";
  // base+active
  if (coord === slice) return "full";
  if (coord === baseSlice) return "ghost";
  return "hidden";
}
