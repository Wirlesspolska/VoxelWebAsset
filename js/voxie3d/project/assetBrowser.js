/**
 * Memory-light asset browser.
 *
 * Model:
 * - **Browser index**: metadata only (id, name, kind, path, bytes?) — never full pixels.
 * - **Active palette**: currently used colors/textures kept in RAM via activate().
 * - activate(id) fetch/loads payload into active set; evict(id) / LRU frees inactive.
 *
 * Sources: conceptual `assets/` paths + recent list + in-session registrations.
 */

import { ASSET_ROOT, listRecent, listRecentFiltered } from "./index.js";
import { hydrateTextureDef, serializeTextureDef } from "../tools/texturizer.js";

const DEFAULT_LRU = 8;

/**
 * @typedef {{ id:string, name:string, kind:string, pathOrKey?:string, bytes?:number, source?:string }} AssetMeta
 */

/**
 * @param {object} [opts]
 * @param {number} [opts.maxActive=8] LRU cap for loaded payloads
 * @param {(url:string)=>Promise<any>} [opts.fetcher]
 */
export function createAssetBrowser(opts = {}) {
  const maxActive = Math.max(1, opts.maxActive || DEFAULT_LRU);
  const fetcher =
    opts.fetcher ||
    (async (url) => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json") || /\.(json|vxt|vxw)$/i.test(url)) return res.json();
      return res.text();
    });

  /** @type {Map<string, AssetMeta>} */
  const index = new Map();
  /** @type {Map<string, { payload:any, at:number }>} */
  const active = new Map();
  /** @type {string[]} LRU order oldest → newest */
  let lru = [];

  function touch(id) {
    lru = lru.filter((x) => x !== id);
    lru.push(id);
    while (lru.length > maxActive) {
      const drop = lru.shift();
      if (drop) active.delete(drop);
    }
  }

  function register(meta) {
    if (!meta?.id) return null;
    const m = {
      id: String(meta.id),
      name: meta.name || meta.id,
      kind: meta.kind || "json",
      pathOrKey: meta.pathOrKey,
      bytes: Number.isFinite(meta.bytes) ? meta.bytes : undefined,
      source: meta.source || "session",
    };
    index.set(m.id, m);
    return m;
  }

  /** Seed index from recent + known asset paths (metadata only). */
  function refreshIndex(extra = []) {
    for (const r of listRecentFiltered({ preferAssets: true })) {
      register({
        id: r.pathOrKey || `${r.type}:${r.name}`,
        name: r.name,
        kind: r.kind || "json",
        pathOrKey: r.pathOrKey,
        source: "recent",
      });
    }
    for (const r of listRecent()) {
      register({
        id: r.pathOrKey || `${r.type}:${r.name}`,
        name: r.name,
        kind: r.kind || "json",
        pathOrKey: r.pathOrKey,
        source: "recent",
      });
    }
    // Conceptual defaults under assets/ — listed without fetch.
    const defaults = [
      { id: "assets/textures/default.vxt", name: "default.vxt", kind: "vxt", pathOrKey: "assets/textures/default.vxt" },
      { id: "assets/manifest.example.json", name: "manifest.example", kind: "json", pathOrKey: "assets/manifest.example.json" },
      { id: "assets/parts/untitled_part.json", name: "untitled_part", kind: "json", pathOrKey: "assets/parts/untitled_part.json" },
    ];
    for (const d of defaults) register({ ...d, source: "assets" });
    for (const e of extra) register(e);
    return list();
  }

  function list() {
    return [...index.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function listActive() {
    return lru
      .map((id) => {
        const meta = index.get(id);
        const slot = active.get(id);
        if (!meta || !slot) return null;
        return { ...meta, payload: slot.payload, active: true };
      })
      .filter(Boolean);
  }

  function getActive(id) {
    const slot = active.get(id);
    if (!slot) return null;
    touch(id);
    return slot.payload;
  }

  /**
   * Load into active set. Uses pathOrKey fetch, or `inline` payload from register.
   * @param {string} id
   * @param {any} [inlinePayload]
   */
  async function activate(id, inlinePayload) {
    const meta = index.get(id) || register({ id, name: id, kind: "json" });
    if (inlinePayload != null) {
      active.set(id, { payload: inlinePayload, at: Date.now() });
      touch(id);
      return inlinePayload;
    }
    if (active.has(id)) {
      touch(id);
      return active.get(id).payload;
    }
    const url = meta.pathOrKey || id;
    // Only fetch when it looks like a relative asset path.
    if (!String(url).startsWith(ASSET_ROOT) && !String(url).startsWith("assets/")) {
      return null;
    }
    try {
      const data = await fetcher(url);
      let payload = data;
      if (data?.textures) payload = data;
      else if (data?.weights || data?.size) payload = hydrateTextureDef(data);
      active.set(id, { payload, at: Date.now() });
      touch(id);
      return payload;
    } catch (err) {
      console.warn("[Voxie3D] asset activate failed", id, err);
      return null;
    }
  }

  function evict(id) {
    active.delete(id);
    lru = lru.filter((x) => x !== id);
  }

  function evictAll() {
    active.clear();
    lru = [];
  }

  /** Register a texture def as browsable + optionally activate. */
  function registerTexture(def, activateNow = true) {
    const ser = serializeTextureDef(def);
    const meta = register({
      id: ser.id,
      name: ser.id,
      kind: "texture",
      source: "session",
      bytes: JSON.stringify(ser).length,
    });
    if (activateNow) {
      active.set(ser.id, { payload: hydrateTextureDef(ser), at: Date.now() });
      touch(ser.id);
    }
    return meta;
  }

  function stats() {
    return {
      indexed: index.size,
      active: active.size,
      maxActive,
      lru: [...lru],
    };
  }

  refreshIndex();

  return {
    refreshIndex,
    register,
    registerTexture,
    list,
    listActive,
    getActive,
    activate,
    evict,
    evictAll,
    stats,
  };
}
