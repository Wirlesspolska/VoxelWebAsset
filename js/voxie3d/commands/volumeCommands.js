/**
 * Volume mutation contract (future lock).
 *
 * Ownership:
 *   - VoxelGrid cells  → mutate only via createVoxie3D `api.*` / this module
 *   - Groups           → api.groups + api.applyGroup* / startGroup / stopGroup
 *   - History          → UndoStack via api.undo / api.redo / paint commits
 *   - Prefs            → ui/prefs.js + api.applyPerformancePrefs / setPotatoMode
 *
 * Hard rule: UI panels and binders MUST NOT call `grid.set` / `grid.delete`
 * directly. Go through controller commands so undo, groups, and meshing stay coherent.
 *
 * This module is the documented seam for extracting pure command functions later.
 * Controllers may re-export thin wrappers; do not bypass from panels.
 */

/** @typedef {{ x:number, y:number, z:number, color?: string, partId?: string }} CellWrite */

/**
 * Runtime assert for accidental panel→grid writes during development.
 * No-op unless `globalThis.__VOXIE_STRICT_VOLUME__ === true`.
 * @param {string} source
 */
export function assertVolumeCommandPath(source = "unknown") {
  if (globalThis.__VOXIE_STRICT_VOLUME__ !== true) return;
  console.warn(
    `[Voxie3D] volume write outside commands path? source=${source}. Use api.* / commands.`
  );
}

/**
 * Preferred place/erase entry for future extraction from ForgeInput.
 * Currently documents the contract; hosts still use api paint paths.
 * @param {object} api createVoxie3D controller
 * @param {CellWrite[]} cells
 * @param {'place'|'erase'} mode
 */
export function commitCells(api, cells, mode = "place") {
  if (!api || !Array.isArray(cells) || !cells.length) return 0;
  if (typeof api.paintCells === "function") {
    return api.paintCells(cells, mode);
  }
  // Fallback: individual paint helpers if present
  let n = 0;
  for (const c of cells) {
    if (mode === "erase") {
      if (api.eraseAt?.(c.x, c.y, c.z)) n++;
    } else if (api.placeAt?.(c.x, c.y, c.z, c.color)) {
      n++;
    }
  }
  return n;
}
