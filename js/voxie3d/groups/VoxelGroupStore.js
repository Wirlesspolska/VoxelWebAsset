/**
 * Voxel grouping for asset/world authoring.
 *
 * Export shape (on volume):
 *   groups: [{ id, name, color, voxelKeys: ['x|y|z', ...] }]
 *
 * Recording: startGroup → placed voxels join active group → stopGroup.
 * Select a group → recolor all members; optional linear gradient / shade ramp.
 */

import { voxelKey } from "../core/VoxelGrid.js";
import { hexToRgb, rgbToHex, hexToHsb, hsbToHex, clamp } from "../color/hsb.js";
import { applyChannelsToKeys, clusterByColor } from "./channelApply.js";

function slugId(prefix = "grp") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseKey(key) {
  const [x, y, z] = String(key).split("|").map(Number);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x: x | 0, y: y | 0, z: z | 0 };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize prop prefix for stamp groups: "branch", "rock", …
 * @param {string} propName
 */
function normalizePropName(propName) {
  const s = String(propName || "shape")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return s || "shape";
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(
    Math.round(lerp(A.r, B.r, t)),
    Math.round(lerp(A.g, B.g, t)),
    Math.round(lerp(A.b, B.b, t))
  );
}

/**
 * Normalize a groups array from volume JSON.
 * @param {unknown} raw
 */
export function normalizeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const id = typeof g.id === "string" && g.id ? g.id : slugId("grp");
    const name = typeof g.name === "string" && g.name.trim() ? g.name.trim() : id;
    const color = typeof g.color === "string" ? g.color : "#c4e070";
    const keys = Array.isArray(g.voxelKeys)
      ? g.voxelKeys.map(String).filter((k) => !!parseKey(k))
      : [];
    out.push({ id, name, color, voxelKeys: [...new Set(keys)] });
  }
  return out;
}

export function createVoxelGroupStore(initial = []) {
  /** @type {{ id: string, name: string, color: string, voxelKeys: Set<string> }[]} */
  let groups = normalizeGroups(initial).map((g) => ({
    ...g,
    voxelKeys: new Set(g.voxelKeys),
  }));
  /** @type {string|null} */
  let recordingId = null;
  /** @type {string|null} */
  let selectedId = null;
  /** @type {Set<string>} multi-select for collective apply */
  let selectedIds = new Set();
  let seq = groups.length + 1;

  function find(id) {
    return groups.find((g) => g.id === id) || null;
  }

  function exportGroups() {
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      voxelKeys: Array.from(g.voxelKeys),
    }));
  }

  function importGroups(raw) {
    groups = normalizeGroups(raw).map((g) => ({
      ...g,
      voxelKeys: new Set(g.voxelKeys),
    }));
    recordingId = null;
    if (selectedId && !find(selectedId)) selectedId = null;
    selectedIds = new Set([...selectedIds].filter((id) => !!find(id)));
    seq = Math.max(
      groups.length + 1,
      ...groups.map((g) => {
        const m = /^Group\s+(\d+)$/i.exec(g.name);
        return m ? Number(m[1]) + 1 : 0;
      })
    );
    return exportGroups();
  }

  function clear() {
    groups = [];
    recordingId = null;
    selectedId = null;
    selectedIds.clear();
    seq = 1;
  }

  /**
   * Start recording into a new (or named) group.
   * @param {{ name?: string, color?: string, id?: string }} [opts]
   */
  function startGroup(opts = {}) {
    const color = typeof opts.color === "string" ? opts.color : "#c4e070";
    const name =
      typeof opts.name === "string" && opts.name.trim()
        ? opts.name.trim()
        : `Group ${seq++}`;
    const id = typeof opts.id === "string" && opts.id ? opts.id : slugId("grp");
    const existing = find(id);
    if (existing) {
      existing.name = name;
      existing.color = color;
      recordingId = id;
      selectedId = id;
      return { ...existing, voxelKeys: Array.from(existing.voxelKeys) };
    }
    const g = { id, name, color, voxelKeys: new Set() };
    groups.push(g);
    recordingId = id;
    selectedId = id;
    return { id, name, color, voxelKeys: [] };
  }

  function stopGroup() {
    const id = recordingId;
    recordingId = null;
    return id;
  }

  function isRecording() {
    return !!recordingId;
  }

  function getRecordingId() {
    return recordingId;
  }

  function selectGroup(id, opts = {}) {
    if (id == null) {
      selectedId = null;
      selectedIds.clear();
      return null;
    }
    const g = find(id);
    if (!g) return null;
    if (opts.additive) {
      if (selectedIds.has(g.id)) selectedIds.delete(g.id);
      else selectedIds.add(g.id);
      selectedId = selectedIds.size ? g.id : null;
      if (selectedId && !selectedIds.has(selectedId)) {
        selectedId = selectedIds.values().next().value || null;
      }
    } else {
      selectedId = g.id;
      selectedIds = new Set([g.id]);
    }
    return { id: g.id, name: g.name, color: g.color, voxelKeys: Array.from(g.voxelKeys) };
  }

  function getSelectedId() {
    return selectedId;
  }

  function getSelectedIds() {
    return Array.from(selectedIds);
  }

  function list() {
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      count: g.voxelKeys.size,
      recording: g.id === recordingId,
      selected: g.id === selectedId || selectedIds.has(g.id),
    }));
  }

  /** Add keys to the active recording group (no-op if not recording). */
  function addKeys(keys) {
    if (!recordingId) return 0;
    const g = find(recordingId);
    if (!g) return 0;
    let n = 0;
    for (const k of keys) {
      const key = typeof k === "string" ? k : voxelKey(k.x, k.y, k.z);
      if (!parseKey(key)) continue;
      if (!g.voxelKeys.has(key)) {
        g.voxelKeys.add(key);
        n++;
      }
    }
    return n;
  }

  /** Remove keys from every group (e.g. after erase). */
  function removeKeys(keys) {
    let n = 0;
    const set = new Set(
      keys.map((k) => (typeof k === "string" ? k : voxelKey(k.x, k.y, k.z)))
    );
    for (const g of groups) {
      for (const k of set) {
        if (g.voxelKeys.delete(k)) n++;
      }
    }
    return n;
  }

  /**
   * Recolor all member voxels via grid setter.
   * @param {string} id
   * @param {string} color
   * @param {(x:number,y:number,z:number,color:string)=>void} setVoxel
   */
  function recolorGroup(id, color, setVoxel) {
    const g = find(id);
    if (!g) return 0;
    g.color = color;
    let n = 0;
    for (const key of g.voxelKeys) {
      const c = parseKey(key);
      if (!c) continue;
      setVoxel(c.x, c.y, c.z, color);
      n++;
    }
    return n;
  }

  /**
   * Linear gradient along an axis across group members.
   * @param {string} id
   * @param {'x'|'y'|'z'} axis
   * @param {string} colorA
   * @param {string} colorB
   * @param {(x:number,y:number,z:number,color:string)=>void} setVoxel
   */
  function applyLinearGradient(id, axis, colorA, colorB, setVoxel) {
    const g = find(id);
    if (!g || g.voxelKeys.size === 0) return 0;
    const ax = axis === "x" || axis === "y" || axis === "z" ? axis : "y";
    const cells = [];
    for (const key of g.voxelKeys) {
      const c = parseKey(key);
      if (c) cells.push(c);
    }
    if (!cells.length) return 0;
    let min = Infinity;
    let max = -Infinity;
    for (const c of cells) {
      const v = c[ax];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min || 1;
    let n = 0;
    for (const c of cells) {
      const t = (c[ax] - min) / span;
      const col = lerpHex(colorA, colorB, t);
      setVoxel(c.x, c.y, c.z, col);
      n++;
    }
    // Group "shared color" becomes the mid gradient tone for UI swatch.
    g.color = lerpHex(colorA, colorB, 0.5);
    return n;
  }

  /**
   * Lighten/darken shade ramp across group by axis (brightness only).
   * amount: e.g. 0.35 → ±/max bright delta around current HSB.
   * @param {string} id
   * @param {'x'|'y'|'z'} axis
   * @param {number} amount 0–1
   * @param {(x:number,y:number,z:number,color:string)=>void} setVoxel
   */
  function applyShadeRamp(id, axis, amount, setVoxel) {
    const g = find(id);
    if (!g || g.voxelKeys.size === 0) return 0;
    const ax = axis === "x" || axis === "y" || axis === "z" ? axis : "y";
    const amp = clamp(Number(amount) || 0.3, 0, 1);
    const base = hexToHsb(g.color);
    const cells = [];
    for (const key of g.voxelKeys) {
      const c = parseKey(key);
      if (c) cells.push(c);
    }
    let min = Infinity;
    let max = -Infinity;
    for (const c of cells) {
      const v = c[ax];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min || 1;
    let n = 0;
    for (const c of cells) {
      const t = (c[ax] - min) / span;
      // Dark at min axis → light at max
      const bri = clamp(base.b + (t - 0.5) * 2 * amp * 100, 8, 100);
      setVoxel(c.x, c.y, c.z, hsbToHex(base.h, base.s, bri));
      n++;
    }
    return n;
  }

  function renameGroup(id, name) {
    const g = find(id);
    if (!g) return null;
    g.name = String(name || g.name).trim() || g.name;
    return g.name;
  }

  function deleteGroup(id) {
    const i = groups.findIndex((g) => g.id === id);
    if (i < 0) return false;
    groups.splice(i, 1);
    if (recordingId === id) recordingId = null;
    if (selectedId === id) selectedId = null;
    selectedIds.delete(id);
    return true;
  }

  /**
   * Smallest positive integer not used by `{propName} #N` among existing groups.
   * @param {string} propName
   */
  function nextFreePropNumber(propName) {
    const base = normalizePropName(propName);
    const re = new RegExp(`^${escapeRegExp(base)}\\s+#(\\d+)$`, "i");
    const used = new Set();
    for (const g of groups) {
      const m = re.exec(g.name);
      if (m) used.add(Number(m[1]));
    }
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  /**
   * Allocate `{propName} #{nextFree}` (e.g. `branch #1`, `rock #2`).
   * @param {string} propName
   */
  function allocPropGroupName(propName) {
    const base = normalizePropName(propName);
    return `${base} #${nextFreePropNumber(base)}`;
  }

  /**
   * Create (or replace) a group from explicit voxel keys — selection → group.
   * @param {string[]|Iterable<string>} keys
   * @param {{ name?: string, color?: string, id?: string, select?: boolean }} [opts]
   */
  function groupFromKeys(keys, opts = {}) {
    const listKeys = [...keys].map(String).filter((k) => !!parseKey(k));
    const color = typeof opts.color === "string" ? opts.color : "#c4e070";
    const name =
      typeof opts.name === "string" && opts.name.trim()
        ? opts.name.trim()
        : `Group ${seq++}`;
    const id = typeof opts.id === "string" && opts.id ? opts.id : slugId("grp");
    const existing = find(id);
    if (existing) {
      existing.name = name;
      existing.color = color;
      existing.voxelKeys = new Set(listKeys);
    } else {
      groups.push({ id, name, color, voxelKeys: new Set(listKeys) });
    }
    if (opts.select !== false) {
      selectedId = id;
      selectedIds = new Set([id]);
    }
    return getGroup(id);
  }

  /**
   * Cluster volume (or selection) by identical / near color into Group #N.
   * Keeps stable ids when a prior group already owns the exact same key set + color bucket.
   * @param {Array<{x:number,y:number,z:number,color:string}>} voxels
   * @param {{ tolerance?: number, selectionKeys?: string[]|Set<string>|null, replace?: boolean, prefix?: string }} [opts]
   */
  function groupByColor(voxels, opts = {}) {
    const buckets = clusterByColor(voxels, {
      tolerance: opts.tolerance ?? 0,
      selectionKeys: opts.selectionKeys || null,
    });
    if (opts.replace) {
      // Remove only auto-named color groups to preserve manually named ones
      groups = groups.filter((g) => !/^Group\s+#?\d+$/i.test(g.name));
    }
    const created = [];
    let n = 1;
    // Stable numbering: continue past existing Group #N
    for (const g of groups) {
      const m = /^Group\s+#?(\d+)$/i.exec(g.name);
      if (m) n = Math.max(n, Number(m[1]) + 1);
    }
    const prefix = typeof opts.prefix === "string" ? opts.prefix : "Group #";
    for (const [, bucket] of buckets) {
      if (!bucket.keys.length) continue;
      // Reuse group with identical key set if present
      const keySet = new Set(bucket.keys);
      let reused = groups.find(
        (g) =>
          g.voxelKeys.size === keySet.size &&
          [...keySet].every((k) => g.voxelKeys.has(k))
      );
      if (reused) {
        reused.color = bucket.color;
        created.push(getGroup(reused.id));
        continue;
      }
      const name = `${prefix}${n++}`;
      const id = slugId("grp");
      groups.push({
        id,
        name,
        color: bucket.color,
        voxelKeys: keySet,
      });
      created.push(getGroup(id));
    }
    seq = Math.max(seq, n);
    if (created.length) {
      selectedId = created[0].id;
      selectedIds = new Set(created.map((g) => g.id));
    }
    return created;
  }

  /**
   * Apply HSB / RGB channel offsets to one or more groups.
   * @param {string|string[]|null} ids null = selected
   * @param {object} adj
   * @param {(x:number,y:number,z:number)=>string|null} getColor
   * @param {(x:number,y:number,z:number,color:string)=>void} setVoxel
   */
  function applyChannels(ids, adj, getColor, setVoxel) {
    const list =
      ids == null
        ? getSelectedIds()
        : Array.isArray(ids)
          ? ids
          : [ids];
    let n = 0;
    for (const id of list) {
      const g = find(id);
      if (!g) continue;
      const count = applyChannelsToKeys(g.voxelKeys, getColor, setVoxel, adj);
      n += count;
      if (count && adj && (adj.hue != null || adj.brightness != null || adj.r != null)) {
        // Update swatch from first member
        const first = g.voxelKeys.values().next().value;
        const c = first ? parseKey(first) : null;
        if (c) {
          const col = getColor(c.x, c.y, c.z);
          if (col) g.color = col;
        }
      }
    }
    return n;
  }

  function getGroup(id) {
    const g = find(id);
    if (!g) return null;
    return {
      id: g.id,
      name: g.name,
      color: g.color,
      voxelKeys: Array.from(g.voxelKeys),
    };
  }

  /** O(groups) Set lookup — avoids exportGroups() array copies per key. */
  function groupIdForKey(key) {
    const k = String(key);
    for (const g of groups) {
      if (g.voxelKeys.has(k)) return g.id;
    }
    return null;
  }

  return {
    startGroup,
    stopGroup,
    isRecording,
    getRecordingId,
    selectGroup,
    getSelectedId,
    getSelectedIds,
    list,
    getGroup,
    groupIdForKey,
    addKeys,
    removeKeys,
    recolorGroup,
    applyLinearGradient,
    applyShadeRamp,
    applyChannels,
    groupFromKeys,
    groupByColor,
    nextFreePropNumber,
    allocPropGroupName,
    renameGroup,
    deleteGroup,
    exportGroups,
    importGroups,
    clear,
    normalizeGroups,
  };
}
