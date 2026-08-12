/**
 * Lightweight browser project / recent-files layer for Voxie3D forge.
 *
 * project.json (VXPJ1):
 * {
 *   magic: 'VXPJ1',
 *   type: 'part'|'world'|'terrain'|'map',
 *   name: string,
 *   updatedAt: ISO string,
 *   // World vertical settings (overridable; default zMin:0). Negative z OK for oceans.
 *   worldBounds?: { zMin: number, zMax?: number, waterLevel?: number },
 *   assets: [{ id, kind: 'vxw'|'vxt'|'png'|'json', pathOrKey }]
 * }
 *
 * Authoring files live conceptually under THIRD_GAME/assets/
 *   worlds/  parts/  textures/  projects/
 * Browser downloads use a safe stem (assets-worlds-name.vxw); pathOrKey keeps the
 * folder form (assets/worlds/name.vxw) for Recent labeling / filters.
 *
 * Recent list: localStorage key `voxie3d.recent` (last N opened projects/assets).
 * Draft draw progress: localStorage key `voxie3d.draft` (project + volume JSON).
 * No backend — file picker + download blob. IndexedDB optional later.
 */

import { DEFAULT_Z_MIN, normalizeWorldBounds, VXW_KINDS } from "../io/vxw.js";

export const PROJECT_MAGIC = "VXPJ1";
export const PROJECT_TYPES = ["part", "world", "terrain", "map"];
export const ASSET_KINDS = ["vxw", "vxt", "vxb", "png", "json"];
export const RECENT_KEY = "voxie3d.recent";
export const RECENT_MAX = 12;
export const DRAFT_KEY = "voxie3d.draft";
/** Conceptual root for author VXW/VXT/projects (repo-relative). */
export const ASSET_ROOT = "assets/";

export { DEFAULT_Z_MIN };

/** Subfolder under assets/ for a project type / asset kind. */
export function assetSubfolder(typeOrKind) {
  const t = String(typeOrKind || "").toLowerCase();
  if (t === "vxt" || t === "png" || t === "texture" || t === "textures") return "textures";
  if (t === "project" || t === "vxpj" || t === "json-project") return "projects";
  if (VXW_KINDS.includes(t) || t === "vxw") return "worlds";
  return "parts";
}

/**
 * Conceptual path: assets/worlds/my.vxw (for Recent / manifests).
 * @param {{ type?: string, name?: string, kind?: string, ext?: string }} opts
 */
export function assetPathOrKey(opts = {}) {
  const type = normalizeProjectType(opts.type, "part");
  const kind = opts.kind || (usesVxw(type) ? "vxw" : "json");
  const folder =
    kind === "vxt" || kind === "png"
      ? "textures"
      : kind === "json" && opts.ext && String(opts.ext).includes("vxpj")
        ? "projects"
        : assetSubfolder(type);
  const ext =
    opts.ext != null
      ? String(opts.ext).replace(/^\./, "")
      : kind === "vxw"
        ? "vxw"
        : kind === "vxt"
          ? "vxt"
          : kind === "vxb"
            ? "vxb"
            : "json";
  const stem = projectFilename({ name: opts.name || `untitled_${type}` });
  return `${ASSET_ROOT}${folder}/${stem}.${ext}`;
}

/**
 * Browser-safe download name (no slashes): assets-worlds-my.vxw
 * Mirrors assetPathOrKey so users can drop the file into the matching folder.
 */
export function assetDownloadFilename(opts = {}) {
  return assetPathOrKey(opts).replace(/\//g, "-");
}

/** True if pathOrKey / filename is under (or named like) assets/. */
export function isAssetsPath(pathOrKey) {
  if (typeof pathOrKey !== "string" || !pathOrKey) return false;
  const p = pathOrKey.replace(/\\/g, "/").toLowerCase();
  return (
    p.startsWith("assets/") ||
    p.startsWith("./assets/") ||
    p.includes("/assets/") ||
    p.startsWith("assets-")
  );
}

/**
 * Recent list with assets/ entries first; optional assets-only filter.
 * @param {{ preferAssets?: boolean, assetsOnly?: boolean }} [opts]
 */
export function listRecentFiltered(opts = {}) {
  const preferAssets = opts.preferAssets !== false;
  const assetsOnly = !!opts.assetsOnly;
  let list = listRecent();
  if (assetsOnly) list = list.filter((r) => isAssetsPath(r.pathOrKey));
  if (!preferAssets) return list;
  const inAssets = [];
  const other = [];
  for (const r of list) {
    if (isAssetsPath(r.pathOrKey)) inAssets.push(r);
    else other.push(r);
  }
  return [...inAssets, ...other];
}

function slugId(prefix = "asset") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeProjectType(type, fallback = "part") {
  if (PROJECT_TYPES.includes(type)) return type;
  if (VXW_KINDS.includes(type)) return type;
  return PROJECT_TYPES.includes(fallback) ? fallback : "part";
}

/**
 * @param {{ type?: string, name?: string, worldBounds?: object, assets?: object[] }} [opts]
 */
export function createProject(opts = {}) {
  const type = normalizeProjectType(opts.type, "part");
  const name =
    typeof opts.name === "string" && opts.name.trim()
      ? opts.name.trim()
      : `untitled_${type}`;
  const worldBounds = normalizeWorldBounds(
    opts.worldBounds || { zMin: DEFAULT_Z_MIN }
  );
  const assets = Array.isArray(opts.assets)
    ? opts.assets.map(normalizeAsset).filter(Boolean)
    : [];
  return {
    magic: PROJECT_MAGIC,
    type,
    name,
    updatedAt: new Date().toISOString(),
    worldBounds,
    assets,
  };
}

function normalizeAsset(a) {
  if (!a || typeof a !== "object") return null;
  const kind = ASSET_KINDS.includes(a.kind) ? a.kind : null;
  if (!kind) return null;
  const pathOrKey = typeof a.pathOrKey === "string" ? a.pathOrKey : "";
  return {
    id: typeof a.id === "string" && a.id ? a.id : slugId(kind),
    kind,
    pathOrKey,
  };
}

export function isProject(raw) {
  return !!(raw && typeof raw === "object" && raw.magic === PROJECT_MAGIC);
}

export function serializeProject(project) {
  const p = createProject(project || {});
  p.updatedAt = new Date().toISOString();
  return {
    magic: PROJECT_MAGIC,
    type: p.type,
    name: p.name,
    updatedAt: p.updatedAt,
    worldBounds: { ...normalizeWorldBounds(p.worldBounds) },
    assets: p.assets.map((a) => ({ ...a })),
  };
}

export function parseProject(raw) {
  const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isProject(doc)) {
    throw new Error("Not a VXPJ1 project (missing magic:'VXPJ1')");
  }
  return createProject({
    type: doc.type,
    name: doc.name,
    worldBounds: doc.worldBounds || {
      zMin: doc.zMin,
      zMax: doc.zMax,
      waterLevel: doc.waterLevel ?? doc.seaLevel,
    },
    assets: doc.assets,
  });
}

/** Touch updatedAt + optional field patches. */
export function touchProject(project, patch = {}) {
  const next = createProject({ ...project, ...patch, assets: patch.assets ?? project?.assets });
  next.updatedAt = new Date().toISOString();
  return next;
}

export function addProjectAsset(project, { kind, pathOrKey, id }) {
  const p = createProject(project);
  const asset = normalizeAsset({ id, kind, pathOrKey });
  if (!asset) return p;
  p.assets = [...p.assets.filter((a) => a.id !== asset.id), asset];
  p.updatedAt = new Date().toISOString();
  return p;
}

/**
 * @param {{ name?: string, type?: string, kind?: string, pathOrKey?: string, openedAt?: string }} entry
 */
export function rememberRecent(entry) {
  if (!entry || typeof entry !== "object") return listRecent();
  const item = {
    name: typeof entry.name === "string" ? entry.name : "untitled",
    type: normalizeProjectType(entry.type, "part"),
    kind: ASSET_KINDS.includes(entry.kind) ? entry.kind : entry.kind || "json",
    pathOrKey: typeof entry.pathOrKey === "string" ? entry.pathOrKey : "",
    openedAt: entry.openedAt || new Date().toISOString(),
  };
  let list = listRecent().filter(
    (r) => !(r.name === item.name && r.kind === item.kind && r.type === item.type)
  );
  list.unshift(item);
  list = list.slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("[Voxie3D] rememberRecent failed", err);
  }
  return list;
}

export function listRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        name: typeof e.name === "string" ? e.name : "untitled",
        type: normalizeProjectType(e.type, "part"),
        kind: typeof e.kind === "string" ? e.kind : "json",
        pathOrKey: typeof e.pathOrKey === "string" ? e.pathOrKey : "",
        openedAt: typeof e.openedAt === "string" ? e.openedAt : "",
      }))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadJSON(filename, obj) {
  const json = JSON.stringify(obj, null, 2);
  downloadBlob(filename, new Blob([json], { type: "application/json" }));
}

/** Safe filename stem from project name. */
export function projectFilename(project, ext) {
  const stem = String(project?.name || "untitled")
    .replace(/[^\w\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "untitled";
  return ext ? `${stem}.${ext.replace(/^\./, "")}` : stem;
}

/** Whether this project type uses VXW world documents. */
export function usesVxw(type) {
  return VXW_KINDS.includes(normalizeProjectType(type));
}

/**
 * Persist in-progress draw (project shell + volume) so reload can restore.
 * @param {{ project: object, volume: object }} payload
 */
export function saveDraft(payload) {
  if (!payload || typeof payload !== "object") return false;
  try {
    const doc = {
      magic: "VXDR1",
      savedAt: new Date().toISOString(),
      project: serializeProject(payload.project || {}),
      volume: payload.volume && typeof payload.volume === "object" ? payload.volume : null,
    };
    if (!doc.volume) return false;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
    return true;
  } catch (err) {
    console.warn("[Voxie3D] saveDraft failed", err);
    return false;
  }
}

/** @returns {{ magic:string, savedAt:string, project:object, volume:object }|null} */
export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (!doc || doc.magic !== "VXDR1" || !doc.volume) return null;
    return {
      magic: doc.magic,
      savedAt: typeof doc.savedAt === "string" ? doc.savedAt : "",
      project: isProject(doc.project) ? parseProject(doc.project) : createProject(doc.project || {}),
      volume: doc.volume,
    };
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasDraft() {
  return !!loadDraft();
}
