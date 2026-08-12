/**
 * Forge preferences (localStorage). Defaults for new sessions / Preferences modal.
 */

export const PREFS_KEY = "voxie3d.prefs";

export const DEFAULT_PREFS = {
  zMin: 0,
  zMax: null,
  waterLevel: null,
  borders: true,
  layerMode: "all",
  brushSize: 1,
  showGrid: true,
  /** Opt-in only — position hash tint must never apply by default. */
  noiseTint: false,
  noiseAmount: 0.08,
  /** Start empty projects near origin with this cubic extent (even). */
  startSize: 8,
  sizeX: 8,
  sizeY: 8,
  sizeZ: 8,
  autoExpand: true,
  /** RGB axis arrows — opt-in (off for part sculpt; optional in world). */
  showAxisGizmo: false,
  /** Low-cost profile for weak machines. */
  potatoMode: false,
  /** 0 = uncapped rAF (vsync-ish); else 30 / 60 / 120 */
  fpsLimit: 0,
  /** Cap for devicePixelRatio (0.5 / 1 / 1.5 / 2). Potato forces 1. */
  pixelRatioCap: 2,
  /**
   * Shadow maps pref (off by default). Maps only enable when a user light exists
   * and potato is off — ambient-only scenes never pay for shadow passes.
   */
  shadows: false,
  /**
   * Voxel mesh path: instances (full cubes, default) | hybrid | greedy (surface faces).
   * Full cubes restored as default — greedy half-faces read as broken for authoring.
   */
  meshMode: "instances",
  /** Terrain block atlas textures (potato drops to flat tile colors). */
  blockTextures: true,
  /** Dirty-chunk rebuild delay ms; 0 = next animation frame. */
  chunkCoalesceMs: 0,
  /** Max chunk rebuilds per flush; 0 = unlimited. */
  maxDirtyChunksPerFrame: 0,
  /** FPS chip / nerd overlay visibility. */
  showFpsOverlay: true,
  /**
   * Distance / focus LOD for dense voxel chunks.
   * off | distance | center-cone
   */
  lodMode: "off",
  /** Full detail within this camera distance (world units ≈ cells). */
  lodNear: 28,
  /** Reduced detail beyond near up to this distance (farther still reduced). */
  lodFar: 72,
  /** When true, voxel borders only on near (full-detail) chunks. */
  bordersNearOnly: false,
  /**
   * Render path lean:
   * gpu = instancing + mesh worker (default)
   * cpu-lite = fewer updates, more coalesce, main-thread pack
   */
  renderPath: "gpu",
  /** Cap solid+ghost instances on screen; 0 = unlimited. */
  maxInstances: 0,
  /** Off-main-thread chunk packing (ignored when renderPath is cpu-lite). */
  meshWorker: true,
  /**
   * Mesh worker pool size: 0 = main thread only · 1 · 2 · 'auto'
   * (auto = min(4, navigator.hardwareConcurrency || 2)).
   * When 0, meshWorker is treated as false.
   */
  meshWorkerThreads: "auto",
  /**
   * WebGL context powerPreference — requires renderer recreate on change.
   * default | low-power | high-performance
   */
  gpuPowerPreference: "high-performance",
  /** MSAA antialias (WebGL context attribute; recreate on change). */
  antialias: true,
  /** Shader precision hint for WebGLRenderer (mediump | highp); recreate on change. */
  shaderPrecision: "highp",
  /** Skip WebGL render when camera still and no dirty mesh work. */
  skipIdleRender: false,
  /** Side panel dock: left | right */
  dockSide: "left",
  /** Keyboard camera move speed (world units / sec; grid-snap scales repeat). */
  moveSpeed: 10,
  /** When true, keyboard move steps by cell size instead of continuous glide. */
  keyboardGridSnap: false,
};

/**
 * Resolve mesh worker thread pref to 0 | 1 | 2 | 'auto'.
 * Legacy: meshWorker false → 0; meshWorker true / missing threads → 'auto'.
 * @param {unknown} raw
 * @param {unknown} [legacyMeshWorker]
 * @returns {0|1|2|'auto'}
 */
export function normalizeMeshWorkerThreads(raw, legacyMeshWorker) {
  if (raw === 0 || raw === "0") return 0;
  if (raw === 1 || raw === "1") return 1;
  if (raw === 2 || raw === "2") return 2;
  if (raw === "auto") return "auto";
  if (legacyMeshWorker === false) return 0;
  return DEFAULT_PREFS.meshWorkerThreads;
}

/**
 * Concrete pool size from thread pref (0 = off).
 * @param {0|1|2|'auto'|string|number} pref
 */
export function resolveMeshWorkerCount(pref) {
  const n = normalizeMeshWorkerThreads(pref);
  if (n === 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 2;
  const hc =
    (typeof navigator !== "undefined" && Number(navigator.hardwareConcurrency)) || 2;
  return Math.max(1, Math.min(4, hc | 0));
}

/**
 * @param {unknown} raw
 */
export function normalizePrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const layer = ["all", "active", "base+active"].includes(src.layerMode)
    ? src.layerMode
    : DEFAULT_PREFS.layerMode;
  const brushW = Math.max(1, Math.min(32, Number(src.brushW) || Number(src.brushSize) || 1)) | 0;
  const brushH = Math.max(1, Math.min(32, Number(src.brushH) || (src.brushSize === 3 ? 3 : brushW))) | 0;
  const clampSize = (n, fb) => {
    const v = Number.isFinite(n) ? n | 0 : fb;
    let s = Math.max(2, Math.min(128, v));
    if (s % 2) s += 1;
    return s;
  };
  const startSize = clampSize(src.startSize ?? src.sizeX, DEFAULT_PREFS.startSize);
  const fpsRaw = Number(src.fpsLimit);
  const fpsLimit = [0, 30, 60, 120].includes(fpsRaw) ? fpsRaw : DEFAULT_PREFS.fpsLimit;
  const dprRaw = Number(src.pixelRatioCap);
  const pixelRatioCap = [0.5, 1, 1.5, 2].includes(dprRaw)
    ? dprRaw
    : DEFAULT_PREFS.pixelRatioCap;
  const coalesce = Number.isFinite(src.chunkCoalesceMs)
    ? Math.max(0, Math.min(250, src.chunkCoalesceMs | 0))
    : DEFAULT_PREFS.chunkCoalesceMs;
  const maxDirty = Number.isFinite(src.maxDirtyChunksPerFrame)
    ? Math.max(0, Math.min(256, src.maxDirtyChunksPerFrame | 0))
    : DEFAULT_PREFS.maxDirtyChunksPerFrame;
  const lodMode = ["off", "distance", "center-cone"].includes(src.lodMode)
    ? src.lodMode
    : DEFAULT_PREFS.lodMode;
  const lodNear = Number.isFinite(src.lodNear)
    ? Math.max(4, Math.min(512, Number(src.lodNear)))
    : DEFAULT_PREFS.lodNear;
  const lodFarRaw = Number.isFinite(src.lodFar)
    ? Math.max(8, Math.min(1024, Number(src.lodFar)))
    : DEFAULT_PREFS.lodFar;
  const lodFar = Math.max(lodNear + 4, lodFarRaw);
  const renderPath = src.renderPath === "cpu-lite" ? "cpu-lite" : "gpu";
  const maxInstances = Number.isFinite(src.maxInstances)
    ? Math.max(0, Math.min(2_000_000, src.maxInstances | 0))
    : DEFAULT_PREFS.maxInstances;
  const meshWorkerThreads = normalizeMeshWorkerThreads(
    src.meshWorkerThreads,
    src.meshWorker
  );
  const meshWorker = meshWorkerThreads !== 0;
  const gpuPowerPreference = ["default", "low-power", "high-performance"].includes(
    src.gpuPowerPreference
  )
    ? src.gpuPowerPreference
    : DEFAULT_PREFS.gpuPowerPreference;
  const antialias =
    src.antialias != null ? !!src.antialias : src.potatoMode ? false : DEFAULT_PREFS.antialias;
  const shaderPrecision =
    src.shaderPrecision === "mediump" || src.shaderPrecision === "highp"
      ? src.shaderPrecision
      : DEFAULT_PREFS.shaderPrecision;
  return {
    zMin: Number.isFinite(src.zMin) ? (src.zMin | 0) : DEFAULT_PREFS.zMin,
    zMax: Number.isFinite(src.zMax) ? (src.zMax | 0) : null,
    waterLevel: Number.isFinite(src.waterLevel) ? (src.waterLevel | 0) : null,
    // Borders independent of potato (potato may soft-default Off on enable in setPotatoMode).
    borders: src.borders !== false,
    layerMode: layer,
    brushSize: brushW >= 3 && brushH >= 3 ? 3 : 1,
    brushW,
    brushH,
    brushShape: src.brushShape === "circle" ? "circle" : "rect",
    circleRadius: Math.max(1, Math.min(16, Number(src.circleRadius) || 4)) | 0,
    showGrid: src.showGrid !== false,
    // Explicit opt-in only (legacy `!== false` was the position-tint bug).
    noiseTint: src.potatoMode ? false : src.noiseTint === true,
    noiseAmount: Number.isFinite(src.noiseAmount)
      ? Math.min(0.5, Math.max(0, Number(src.noiseAmount)))
      : DEFAULT_PREFS.noiseAmount,
    startSize,
    sizeX: clampSize(src.sizeX, startSize),
    sizeY: clampSize(src.sizeY, startSize),
    sizeZ: clampSize(src.sizeZ, startSize),
    autoExpand: src.autoExpand !== false,
    showAxisGizmo: src.showAxisGizmo === true,
    potatoMode: !!src.potatoMode,
    fpsLimit,
    pixelRatioCap,
    shadows: src.potatoMode ? false : !!src.shadows,
    // Authoring default is full cubes; migrate saved "greedy" prefs back (half-face look).
    meshMode: src.meshMode === "hybrid" ? "hybrid" : "instances",
    blockTextures: src.blockTextures !== false,
    chunkCoalesceMs: coalesce,
    maxDirtyChunksPerFrame: maxDirty,
    showFpsOverlay: src.showFpsOverlay !== false,
    lodMode,
    lodNear,
    lodFar,
    bordersNearOnly: src.bordersNearOnly === true,
    renderPath,
    maxInstances,
    meshWorker,
    meshWorkerThreads,
    gpuPowerPreference,
    antialias: src.potatoMode ? false : antialias,
    shaderPrecision,
    skipIdleRender: src.skipIdleRender === true,
    dockSide: src.dockSide === "right" ? "right" : "left",
    moveSpeed: Number.isFinite(src.moveSpeed)
      ? Math.max(0.25, Math.min(64, Number(src.moveSpeed)))
      : DEFAULT_PREFS.moveSpeed,
    keyboardGridSnap: src.keyboardGridSnap === true,
  };
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  const next = normalizePrefs(prefs);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("[Voxie3D] savePrefs failed", err);
  }
  return next;
}
