/**
 * In-memory asset / material / draft cache for Voxie forge.
 * Prefer retaining entries over GC thrash; dispose only on explicit clear.
 */

import { MATERIAL_PRESETS } from "../materials/palettes.js";
import { PRESET_COLORS } from "../color/hsb.js";
import { loadDraft, saveDraft, DRAFT_KEY } from "../project/index.js";

const GLOBAL_KEY = "__voxie3dAssetCache";

/**
 * @returns {ReturnType<typeof createAssetCache>}
 */
export function getAssetCache() {
  if (typeof globalThis !== "undefined" && globalThis[GLOBAL_KEY]) {
    return globalThis[GLOBAL_KEY];
  }
  const cache = createAssetCache();
  if (typeof globalThis !== "undefined") globalThis[GLOBAL_KEY] = cache;
  return cache;
}

export function createAssetCache() {
  /** @type {Map<string, { data: any, at: number, kind?: string }>} */
  const memory = new Map();
  /** @type {Map<string, any>} retained THREE materials / shared resources by key */
  const materials = new Map();
  /** @type {Map<string, object>} recent volume snapshots */
  const volumes = new Map();
  let draftSnapshot = null;

  function set(key, data, kind = "json") {
    memory.set(String(key), { data, at: Date.now(), kind });
    return data;
  }

  function get(key) {
    const e = memory.get(String(key));
    return e ? e.data : null;
  }

  function has(key) {
    return memory.has(String(key));
  }

  function rememberVolume(id, volume) {
    if (!id || !volume) return;
    volumes.set(String(id), volume);
    set(`volume:${id}`, volume, "volume");
  }

  function getVolume(id) {
    return volumes.get(String(id)) || get(`volume:${id}`);
  }

  function rememberMaterial(key, mat) {
    if (!key || !mat) return mat;
    materials.set(String(key), mat);
    return mat;
  }

  function getMaterial(key) {
    return materials.get(String(key)) || null;
  }

  function saveDraftNow(payload) {
    draftSnapshot = payload;
    saveDraft(payload);
    if (payload?.volume) rememberVolume("draft", payload.volume);
    return payload;
  }

  function loadDraftCached() {
    if (draftSnapshot) return draftSnapshot;
    draftSnapshot = loadDraft();
    if (draftSnapshot?.volume) rememberVolume("draft", draftSnapshot.volume);
    return draftSnapshot;
  }

  /**
   * Best-effort preload of palette constants + optional URLs (manifest, VXT, volumes).
   * Failed fetches are ignored — cache stays warm for what loaded.
   * @param {string[]} [urls]
   */
  async function preload(urls = []) {
    set("palettes:materials", MATERIAL_PRESETS, "palette");
    set("palettes:presets", PRESET_COLORS, "palette");
    loadDraftCached();

    const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
    const results = await Promise.allSettled(
      list.map(async (url) => {
        if (has(url)) return get(url);
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get("content-type") || "";
        const data = ct.includes("json") || /\.(json|vxw|vxt|vxpj)$/i.test(url)
          ? await res.json()
          : await res.text();
        return set(url, data, "fetch");
      })
    );
    return results;
  }

  /** Warm known authoring paths when served over HTTP. */
  async function preloadDefaults() {
    return preload([
      "assets/manifest.example.json",
      "assets/textures/default.vxt",
      "assets/worlds/untitled_world.vxw",
      "assets/parts/untitled_part.json",
    ]);
  }

  function stats() {
    return {
      memoryEntries: memory.size,
      materials: materials.size,
      volumes: volumes.size,
      hasDraft: !!(draftSnapshot || (typeof localStorage !== "undefined" && localStorage.getItem(DRAFT_KEY))),
    };
  }

  /** Explicit wipe — not called on ordinary voxel edits. */
  function clear(opts = {}) {
    if (opts.materials !== false) materials.clear();
    if (opts.memory !== false) memory.clear();
    if (opts.volumes !== false) volumes.clear();
    if (opts.draft) draftSnapshot = null;
  }

  return {
    set,
    get,
    has,
    rememberVolume,
    getVolume,
    rememberMaterial,
    getMaterial,
    saveDraftNow,
    loadDraftCached,
    preload,
    preloadDefaults,
    stats,
    clear,
    /** @deprecated use materials map via getMaterial/rememberMaterial */
    materials,
  };
}
