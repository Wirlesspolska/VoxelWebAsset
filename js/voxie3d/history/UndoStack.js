/**
 * Compact volume undo/redo for Voxie forge.
 *
 * Entries store before/after cell maps for touched keys (+ optional groups snapshot),
 * not full volume clones. Cap keeps memory bounded.
 */

import { cloneVoxel } from "../core/serialize.js";

export const UNDO_MAX = 50;

/**
 * @typedef {{ x:number, y:number, z:number, color?:string, partId?:string, textureId?:string, texScale?:number, materialId?:string }|null} CellSnap
 * @typedef {{ label?: string, before: Record<string, CellSnap>, after: Record<string, CellSnap>, groupsBefore?: object[], groupsAfter?: object[] }} UndoEntry
 */

/**
 * @param {object} [opts]
 * @param {number} [opts.max=50]
 */
export function createUndoStack(opts = {}) {
  const max = Math.max(1, Math.min(200, opts.max || UNDO_MAX));
  /** @type {UndoEntry[]} */
  let undo = [];
  /** @type {UndoEntry[]} */
  let redo = [];
  /** @type {((info: { canUndo: boolean, canRedo: boolean, undoLen: number, redoLen: number }) => void)|null} */
  let onChange = null;
  let suppress = false;
  let pendingTimer = 0;

  function emit() {
    onChange?.({
      canUndo: undo.length > 0,
      canRedo: redo.length > 0,
      undoLen: undo.length,
      redoLen: redo.length,
    });
  }

  function setOnChange(fn) {
    onChange = typeof fn === "function" ? fn : null;
  }

  function canUndo() {
    return undo.length > 0;
  }

  function canRedo() {
    return redo.length > 0;
  }

  function clear() {
    undo = [];
    redo = [];
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = 0;
    }
    emit();
  }

  function isSuppressed() {
    return suppress;
  }

  /**
   * Snapshot a cell from grid (or null if empty).
   * @param {import('../core/VoxelGrid.js').VoxelGrid} grid
   * @param {string} key
   */
  function snapKey(grid, key) {
    const [x, y, z] = String(key).split("|").map(Number);
    if (![x, y, z].every(Number.isFinite)) return null;
    const cell = grid.get(x, y, z);
    return cell ? cloneVoxel(cell) : null;
  }

  /**
   * Build an entry from touched cells. Call BEFORE mutating for `captureBefore`,
   * or pass explicit before/after maps.
   * @param {object} opts
   * @param {string} [opts.label]
   * @param {Record<string, CellSnap>} opts.before
   * @param {Record<string, CellSnap>} opts.after
   * @param {object[]} [opts.groupsBefore]
   * @param {object[]} [opts.groupsAfter]
   */
  function push(opts) {
    if (suppress) return false;
    const before = opts?.before && typeof opts.before === "object" ? { ...opts.before } : {};
    const after = opts?.after && typeof opts.after === "object" ? { ...opts.after } : {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    if (!keys.size && !opts?.groupsBefore && !opts?.groupsAfter) return false;

    // Drop no-op keys
    for (const k of keys) {
      const b = before[k] ?? null;
      const a = after[k] ?? null;
      if (cellEqual(b, a)) {
        delete before[k];
        delete after[k];
      }
    }
    if (
      !Object.keys(before).length &&
      !Object.keys(after).length &&
      !opts?.groupsBefore &&
      !opts?.groupsAfter
    ) {
      return false;
    }

    const entry = {
      label: typeof opts.label === "string" ? opts.label : "edit",
      before,
      after,
      ...(opts.groupsBefore ? { groupsBefore: opts.groupsBefore } : {}),
      ...(opts.groupsAfter ? { groupsAfter: opts.groupsAfter } : {}),
    };
    undo.push(entry);
    while (undo.length > max) undo.shift();
    redo = [];
    emit();
    return true;
  }

  /**
   * Coalesce rapid edits (paint drag) via timeout; potato-friendly (doesn't freeze).
   * @param {() => UndoEntry|null|false|undefined} buildFn
   * @param {number} [delayMs=16]
   */
  function pushSoon(buildFn, delayMs = 16) {
    if (suppress) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = 0;
      const entry = typeof buildFn === "function" ? buildFn() : null;
      if (entry) push(entry);
    }, Math.max(0, delayMs));
  }

  /**
   * Capture before-state for keys, then after applyFn runs capture after and push.
   * @param {import('../core/VoxelGrid.js').VoxelGrid} grid
   * @param {string[]} keys
   * @param {() => void} applyFn
   * @param {{ label?: string, groups?: { exportGroups: Function, importGroups?: Function } }} [meta]
   */
  function recordKeys(grid, keys, applyFn, meta = {}) {
    if (suppress) {
      applyFn?.();
      return 0;
    }
    const uniq = [...new Set(keys.map(String))];
    const before = {};
    for (const k of uniq) before[k] = snapKey(grid, k);
    const groupsBefore = meta.groups ? meta.groups.exportGroups() : undefined;
    applyFn?.();
    const after = {};
    for (const k of uniq) after[k] = snapKey(grid, k);
    const groupsAfter = meta.groups ? meta.groups.exportGroups() : undefined;
    push({
      label: meta.label,
      before,
      after,
      ...(groupsBefore ? { groupsBefore } : {}),
      ...(groupsAfter ? { groupsAfter } : {}),
    });
    return uniq.length;
  }

  /**
   * Apply an entry directionally.
   * @param {UndoEntry} entry
   * @param {'undo'|'redo'} dir
   * @param {object} api
   * @param {import('../core/VoxelGrid.js').VoxelGrid} api.grid
   * @param {{ importGroups: Function }} [api.groups]
   * @param {(cells: Array<{x:number,y:number,z:number}>) => void} [api.notify]
   */
  function applyEntry(entry, dir, api) {
    const map = dir === "undo" ? entry.before : entry.after;
    const groupsSnap =
      dir === "undo" ? entry.groupsBefore : entry.groupsAfter;
    const touched = [];
    suppress = true;
    try {
      for (const [key, cell] of Object.entries(map)) {
        const [x, y, z] = key.split("|").map(Number);
        if (![x, y, z].every(Number.isFinite)) continue;
        if (cell == null) {
          api.grid.remove(x, y, z);
        } else {
          api.grid.set(x, y, z, { ...cell });
        }
        touched.push({ x, y, z });
      }
      if (groupsSnap && api.groups?.importGroups) {
        api.groups.importGroups(groupsSnap);
        api.grid.setGroups?.(api.groups.exportGroups());
      }
      api.notify?.(touched);
    } finally {
      suppress = false;
    }
    return touched.length;
  }

  function undoOnce(api) {
    const entry = undo.pop();
    if (!entry) return 0;
    const n = applyEntry(entry, "undo", api);
    redo.push(entry);
    emit();
    return n;
  }

  function redoOnce(api) {
    const entry = redo.pop();
    if (!entry) return 0;
    const n = applyEntry(entry, "redo", api);
    undo.push(entry);
    emit();
    return n;
  }

  return {
    UNDO_MAX: max,
    push,
    pushSoon,
    recordKeys,
    undo: undoOnce,
    redo: redoOnce,
    clear,
    canUndo,
    canRedo,
    setOnChange,
    isSuppressed,
    snapKey,
    /** @internal test hooks */
    _stacks: () => ({ undo, redo }),
  };
}

function cellEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.color === b.color &&
    a.partId === b.partId &&
    a.textureId === b.textureId &&
    a.texScale === b.texScale &&
    a.materialId === b.materialId
  );
}
