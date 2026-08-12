/**
 * Voxel selection for Shift+click / box select + attributes editing.
 */

import { voxelKey } from "../core/VoxelGrid.js";

export function createSelectionStore() {
  /** @type {Set<string>} */
  const keys = new Set();
  /** @type {((keys: string[]) => void)|null} */
  let onChange = null;

  function emit() {
    onChange?.([...keys]);
  }

  function setOnChange(fn) {
    onChange = typeof fn === "function" ? fn : null;
  }

  function clear() {
    if (!keys.size) return;
    keys.clear();
    emit();
  }

  function has(x, y, z) {
    return keys.has(voxelKey(x, y, z));
  }

  function add(x, y, z) {
    const k = voxelKey(x, y, z);
    if (keys.has(k)) return false;
    keys.add(k);
    emit();
    return true;
  }

  function toggle(x, y, z) {
    const k = voxelKey(x, y, z);
    if (keys.has(k)) keys.delete(k);
    else keys.add(k);
    emit();
    return keys.has(k);
  }

  function setKeys(list, additive = false) {
    if (!additive) keys.clear();
    for (const k of list || []) keys.add(String(k));
    emit();
  }

  function removeKey(k) {
    if (keys.delete(String(k))) emit();
  }

  function list() {
    return [...keys];
  }

  function size() {
    return keys.size;
  }

  /**
   * Lightweight attribute snapshot for UI (no full voxels[] copy).
   * @param {import('../core/VoxelGrid.js').VoxelGrid} grid
   * @param {(key:string)=>string|null} [groupOf]
   */
  function attributes(grid, groupOf) {
    const ks = list();
    if (!ks.length) return null;

    let count = 0;
    let firstColor = null;
    let mixedColor = false;
    let textureId = null;
    let groupId = null;
    let position = null;

    for (const k of ks) {
      const [x, y, z] = k.split("|").map(Number);
      const v = grid.get(x, y, z);
      if (!v) continue;
      count++;
      if (count === 1) {
        firstColor = v.color || null;
        textureId = v.textureId || null;
        groupId = groupOf?.(k) || null;
        position = { x, y, z };
      } else if (v.color !== firstColor) {
        mixedColor = true;
      }
    }

    if (!count) return { count: 0, keys: ks };

    return {
      count,
      keys: ks,
      position: count === 1 ? position : null,
      color: mixedColor ? null : firstColor,
      mixedColor,
      textureId,
      groupId,
    };
  }

  return {
    setOnChange,
    clear,
    has,
    add,
    toggle,
    setKeys,
    removeKey,
    list,
    size,
    attributes,
    keys,
  };
}
