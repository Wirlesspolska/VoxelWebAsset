import * as THREE from "three";
import { VoxelGrid, voxelKey } from "./core/VoxelGrid.js";
import { createEmitter } from "./core/events.js";
import { normalizeMode, normalizeVolume, normalizeWorldSize } from "./core/serialize.js";
import { VoxelRenderer } from "./render/VoxelRenderer.js";
import { LAYER_MODES } from "./render/layerVisibility.js";
import { createForgeCamera } from "./camera/index.js";
import { ForgeInput } from "./input/ForgeInput.js";
import { normalizeTool } from "./tools/tools.js";
import { applyToolLifecycle, getPanelIdForTool } from "./tools/registry.js";
import { createShapeGenController } from "./generate/index.js";
import { hsbToHex, hexToHsb, clamp, normalizeHex } from "./color/hsb.js";
import { rememberLastColor, createSwatchStore } from "./color/swatches.js";
import { generateTerrain } from "./world/terrain.js";
import { createChunkGenController } from "./world/chunkGen.js";
import { createWorldPawns } from "./world/pawns.js";
import { createLightController } from "./world/lights.js";
import { hashSeed } from "./world/seed.js";
import { getBiome, BIOME_IDS } from "./world/biomes.js";
import { readChunkMeta } from "./world/chunks.js";
import { createVoxelGroupStore } from "./groups/index.js";
import { getMaterialPreset, resolveMaterialColor } from "./materials/palettes.js";
import { createTextureStore } from "./materials/textures.js";
import { applyEffectToKeys, EFFECT_PRESETS } from "./materials/effects.js";
import { applyTexturizerToCells } from "./tools/texturizer.js";
import { packTextures, downloadTexturePack } from "./io/texturePack.js";
import { createAssetBrowser } from "./project/assetBrowser.js";
import { createSelectionStore } from "./select/index.js";
import { getAssetCache } from "./cache/AssetCache.js";
import { createAxisGizmo } from "./render/axisGizmo.js";
import { createNerdOverlay } from "./ui/nerdOverlay.js";
import { createUndoStack } from "./history/index.js";

/**
 * @typedef {'all'|'active'|'base+active'} LayerMode
 * @typedef {'place'|'erase'|'none'} ToolId
 * @typedef {'part'|'world'} VoxieMode
 *
 * @typedef {object} Voxie3DOptions
 * @property {object} [volume] initial volume document
 * @property {VoxieMode} [mode='part']
 * @property {number} [size=24] cubic size (part mode)
 * @property {{x:number,y:number,z:number}} [worldSize] extents (world mode; default 32³)
 * @property {number} [seed] world terrain seed
 * @property {boolean|object} [terrain] auto-generate terrain in world mode (default true)
 * @property {boolean|object} [characters] opt-in preview pawns (default false — off)
 * @property {string} [background='#0c0e0a']
 * @property {boolean} [borders=true]
 * @property {LayerMode} [layerMode='all']
 * @property {ToolId} [tool='place']
 * @property {{h:number,s:number,b:number}} [colorHSB]
 * @property {number} [brushSize=1]
 * @property {boolean} [autostart=true]
 */

const DEFAULT_WORLD_SIZE = { x: 32, y: 32, z: 32 };

/**
 * Create a reusable Voxie3D editor attached to a canvas or container.
 * @param {HTMLElement|HTMLCanvasElement} canvasOrContainer
 * @param {Voxie3DOptions} [options]
 */
export function createVoxie3D(canvasOrContainer, options = {}) {
  if (!canvasOrContainer) throw new Error("createVoxie3D: canvasOrContainer required");

  const host =
    canvasOrContainer instanceof HTMLCanvasElement
      ? canvasOrContainer.parentElement || canvasOrContainer
      : canvasOrContainer;

  let canvas =
    canvasOrContainer instanceof HTMLCanvasElement
      ? canvasOrContainer
      : host.querySelector("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    host.appendChild(canvas);
  }

  const mode = normalizeMode(options.mode ?? options.volume?.mode, "part");
  const worldSize =
    mode === "world"
      ? normalizeWorldSize(
          { worldSize: options.worldSize || options.volume?.worldSize || DEFAULT_WORLD_SIZE },
          32
        )
      : normalizeWorldSize(
          options.volume || { size: options.size ?? 24 },
          options.size ?? 24
        );

  const initial = normalizeVolume(
    options.volume || {
      mode,
      size: worldSize.x,
      worldSize,
      voxels: [],
      ...(Number.isFinite(options.seed) ? { seed: options.seed } : {}),
    }
  );
  initial.mode = mode;
  initial.worldSize = worldSize;
  initial.size = worldSize.x;

  const grid = new VoxelGrid(initial);
  const bus = createEmitter();
  const groups = createVoxelGroupStore(initial.groups || []);
  const history = createUndoStack({ max: 50 });
  history.setOnChange((info) => bus.emit("historyChange", info));
  const shapeGen = createShapeGenController({
    type: options.shapeGenType || "branch",
    size: options.shapeGenSize,
    density: options.shapeGenDensity,
    foundationDepth: options.shapeGenFoundationDepth,
    seed: options.shapeGenSeed,
  });

  const colorHSB = options.colorHSB || { h: 72, s: 55, b: 88 };
  const state = {
    tool: normalizeTool(options.tool ?? "place"),
    brushSize: options.brushSize === 3 ? 3 : 1,
    brushW: Math.max(1, options.brushW || options.brushSize || 1) | 0,
    brushH: Math.max(1, options.brushH || options.brushSize || 1) | 0,
    brushShape: options.brushShape === "circle" ? "circle" : "rect",
    circleRadius: Math.max(1, options.circleRadius || 4) | 0,
    shapeId: options.shapeId || "rect",
    strokeLength: Math.max(1, options.strokeLength || 5) | 0,
    strokeSmooth: !!options.strokeSmooth,
    strokeAsGroup: !!options.strokeAsGroup,
    activeTextureId: null,
    texScale: options.texScale === 16 ? 16 : 8,
    borders: options.borders !== false,
    layerMode: LAYER_MODES.includes(options.layerMode) ? options.layerMode : "all",
    isolatePart: !!options.isolatePart,
    showGrid: options.showGrid !== false,
    noiseTint: options.noiseTint === true,
    noiseAmount: Number.isFinite(options.noiseAmount) ? options.noiseAmount : 0.08,
    materialId: typeof options.materialId === "string" ? options.materialId : null,
    autoExpand: options.autoExpand !== false,
    // Axis arrows are world-placement only — never on for part/asset sculpt.
    showAxisGizmo: mode === "world" && options.showAxisGizmo === true,
    potatoMode: !!options.potatoMode,
    fpsLimit: [30, 60, 120].includes(options.fpsLimit) ? options.fpsLimit : 0,
    pixelRatioCap: [0.5, 1, 1.5, 2].includes(Number(options.pixelRatioCap))
      ? Number(options.pixelRatioCap)
      : 2,
    shadows: !!options.shadows,
    chunkCoalesceMs: Math.max(0, Number(options.chunkCoalesceMs) || 0),
    maxDirtyChunksPerFrame: Math.max(0, Number(options.maxDirtyChunksPerFrame) || 0) | 0,
    showFpsOverlay: options.showFpsOverlay !== false,
    lodMode: ["off", "distance", "center-cone"].includes(options.lodMode)
      ? options.lodMode
      : "off",
    lodNear: Number.isFinite(options.lodNear) ? Number(options.lodNear) : 28,
    lodFar: Number.isFinite(options.lodFar) ? Number(options.lodFar) : 72,
    bordersNearOnly: options.bordersNearOnly === true,
    renderPath: options.renderPath === "cpu-lite" ? "cpu-lite" : "gpu",
    maxInstances: Math.max(0, Number(options.maxInstances) || 0) | 0,
    meshWorkerThreads: (() => {
      const t = options.meshWorkerThreads;
      if (t === 0 || t === "0") return 0;
      if (t === 1 || t === "1") return 1;
      if (t === 2 || t === "2") return 2;
      if (t === "auto") return "auto";
      if (options.meshWorker === false) return 0;
      return "auto";
    })(),
    meshWorker: true, // synced from meshWorkerThreads below
    gpuPowerPreference: ["default", "low-power", "high-performance"].includes(
      options.gpuPowerPreference
    )
      ? options.gpuPowerPreference
      : options.potatoMode
        ? "low-power"
        : "high-performance",
    antialias:
      options.antialias != null
        ? !!options.antialias && !options.potatoMode
        : !options.potatoMode,
    shaderPrecision: options.shaderPrecision === "mediump" ? "mediump" : "highp",
    skipIdleRender: options.skipIdleRender === true,
    /**
     * Legacy hold-stream pref (API/UI). Place/Erase use dedicated LMB/RMB
     * hold paths and do not require this flag.
     */
    paintDrag: options.paintDrag === true,
    /** 'block' = face-adjacent grid; 'free' = camera-weighted depth along ray. */
    snapMode: options.snapMode === "free" ? "free" : "block",
    h: colorHSB.h,
    s: colorHSB.s,
    b: colorHSB.b,
    get colorHex() {
      return normalizeHex(hsbToHex(this.h, this.s, this.b));
    },
  };
  state.meshWorker = state.meshWorkerThreads !== 0;

  const selection = createSelectionStore();
  const textureStore = createTextureStore();
  const assetBrowser = createAssetBrowser({ maxActive: 8 });
  const swatches = createSwatchStore();
  if (initial.meta?.textures) textureStore.importAll(initial.meta.textures);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background || "#0c0e0a");

  /** @type {InstanceType<typeof ForgeInput>|null} */
  let input = null;
  let forceNextRender = true;
  let glContextSig = "";

  function glContextAttrs() {
    return {
      antialias: !!state.antialias && !state.potatoMode,
      alpha: false,
      powerPreference: state.potatoMode
        ? "low-power"
        : state.gpuPowerPreference || "high-performance",
      precision: state.shaderPrecision === "mediump" ? "mediump" : "highp",
    };
  }

  function glContextSignature(attrs = glContextAttrs()) {
    return `${attrs.antialias ? 1 : 0}|${attrs.powerPreference}|${attrs.precision}`;
  }

  function makeWebGLRenderer(targetCanvas) {
    const attrs = glContextAttrs();
    const renderer = new THREE.WebGLRenderer({
      canvas: targetCanvas,
      antialias: attrs.antialias,
      alpha: attrs.alpha,
      powerPreference: attrs.powerPreference,
      precision: attrs.precision,
    });
    // Shadow maps stay off until a user light exists (lightCtl.refreshShadows).
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    glContextSig = glContextSignature(attrs);
    return renderer;
  }

  let webgl = makeWebGLRenderer(canvas);

  function applyPixelRatio() {
    if (state.potatoMode) {
      webgl.setPixelRatio(1);
      return 1;
    }
    const dpr = window.devicePixelRatio || 1;
    const next = Math.min(dpr, state.pixelRatioCap || 2);
    webgl.setPixelRatio(next);
    return next;
  }
  applyPixelRatio();

  /** @type {any} */
  const api = {};
  /** @type {ReturnType<typeof createAxisGizmo>|null} */
  let axisGizmo = null;

  /**
   * powerPreference / antialias / precision are WebGL context creation attrs.
   * Changing them requires a new context (canvas swap + OrbitControls/input rebind).
   */
  function recreateWebGLRenderer(reason = "gpu-prefs") {
    const attrs = glContextAttrs();
    const sig = glContextSignature(attrs);
    if (sig === glContextSig) return webgl;
    const parent = canvas.parentNode;
    if (!parent) return webgl;
    const nextCanvas = document.createElement("canvas");
    if (canvas.className) nextCanvas.className = canvas.className;
    if (canvas.id) nextCanvas.id = canvas.id;
    parent.replaceChild(nextCanvas, canvas);
    try {
      webgl.forceContextLoss?.();
    } catch {
      /* ignore */
    }
    try {
      webgl.dispose();
    } catch {
      /* ignore */
    }
    canvas = nextCanvas;
    webgl = makeWebGLRenderer(canvas);
    applyPixelRatio();
    lightCtl?.refreshShadows?.();
    cam?.rebindDom?.(canvas);
    input?.rebindDom?.(canvas);
    if (api.three) {
      api.three.renderer = webgl;
      api.three.controls = cam.controls;
    }
    forceNextRender = true;
    resize();
    bus.emit("rendererRecreate", {
      reason,
      antialias: attrs.antialias,
      powerPreference: attrs.powerPreference,
      precision: attrs.precision,
    });
    return webgl;
  }

  function ensureWebGLContext(reason) {
    if (glContextSignature() !== glContextSig) recreateWebGLRenderer(reason);
    return webgl;
  }

  const footprint = Math.max(worldSize.x, worldSize.z);
  /** @type {ReturnType<typeof createForgeCamera>|null} */
  let cam = createForgeCamera(canvas, {
    gridSize: footprint,
    far: state.potatoMode ? Math.max(120, footprint * 6) : Math.max(500, footprint * 14),
    onNudgeSlice: (dir) => api.nudgeSlice?.(dir),
    onPivotChange: (pos) => axisGizmo?.setPosition?.(pos),
  });
  const voxelView = new VoxelRenderer(scene, grid);
  voxelView.setBorders(state.borders);
  voxelView.setLayerMode(state.layerMode);
  voxelView.setIsolatePart(state.isolatePart);
  voxelView.setGridVisible(state.showGrid);
  voxelView.setLodCamera(cam.camera);
  voxelView.setLodMode?.(state.lodMode);
  voxelView.setLodNear?.(state.lodNear);
  voxelView.setLodFar?.(state.lodFar);
  voxelView.setBordersNearOnly?.(state.bordersNearOnly);
  voxelView.setRenderPath?.(state.renderPath);
  voxelView.setMaxInstances?.(state.maxInstances);
  voxelView.setMeshWorkerThreads?.(state.meshWorkerThreads);
  if (state.potatoMode) voxelView.setPotatoMode(true);

  // Ambient-only until the user places a light (no default sun/fill).
  const ambient = new THREE.AmbientLight(0x909888, 1.15);
  scene.add(ambient);
  const lightCtl = createLightController({
    scene,
    ambient,
    getShadowsPref: () => !!state.shadows && !state.potatoMode,
    setShadowMapEnabled: (on) => {
      webgl.shadowMap.enabled = !!on && !state.potatoMode;
    },
    setLitMaterials: (on) => voxelView.setLitMaterials?.(!!on && !state.potatoMode),
    markNeedsDraw: () => {
      forceNextRender = true;
      voxelView.markNeedsDraw?.();
    },
  });
  // Apply mesh / texture prefs early (full cubes are the default path).
  if (options.meshMode) voxelView.setMeshMode?.(options.meshMode);
  if (options.blockTextures === false) voxelView.setBlockTextures?.(false);

  if (state.chunkCoalesceMs) voxelView.setRebuildCoalesceMs?.(state.chunkCoalesceMs);
  if (state.maxDirtyChunksPerFrame) {
    voxelView.setMaxDirtyChunksPerFrame?.(state.maxDirtyChunksPerFrame);
  }

  axisGizmo = createAxisGizmo(scene, {
    length: Math.max(3, Math.min(8, footprint * 0.2)),
    visible: state.showAxisGizmo,
    animate: !state.potatoMode,
  });
  // Pivot ball is visual-only for Alt+LMB orbit; hidden in part/asset mode (MMB pan does not need it).
  cam.attachPivotVisual?.(scene, {
    radius: Math.max(0.22, Math.min(0.42, footprint * 0.014)),
    opacity: mode === "world" ? 0.65 : 0.4,
    visible: mode === "world",
  });
  cam.syncPivotToEditPlane?.(grid.axis, grid.slice);

  /** @type {ReturnType<typeof createWorldPawns>|null} */
  let pawns = null;
  // Preview humans are opt-in only — default OFF so paint never respawns walkers.
  const charOpts =
    options.characters === true
      ? {}
      : typeof options.characters === "object" && options.characters
        ? options.characters
        : null;

  const assetCache = getAssetCache();
  assetCache.preloadDefaults?.().catch?.(() => {});

  let emitTimer = 0;
  const EMIT_DEBOUNCE_MS = 80;

  function ensurePawns() {
    if (grid.mode !== "world" || !charOpts) return;
    if (pawns) return; // never respawn on terrain/paint — only create once
    pawns = createWorldPawns(scene, grid, {
      count: charOpts.count ?? 4,
      heightBlocks: charOpts.heightBlocks ?? 2,
      walk: charOpts.walk !== false,
    });
  }

  /** @type {ReturnType<typeof createChunkGenController> | null} */
  let chunkGen = null;

  function runTerrain(seed, terrainOpts = {}) {
    chunkGen?.cancel?.();
    const result = generateTerrain(grid, seed, terrainOpts);
    const biomeId = terrainOpts.biome || result.biome || "greenery";
    chunkGen?.ensureOriginRecorded?.(result.seed, biomeId);
    // Lightweight biome fog tint (optional; not a heavy shader graph).
    const biome = getBiome(biomeId);
    if (terrainOpts.fog !== false && biome.fogHex) {
      lightCtl.setBiomeFog(biome.fogHex, biome.fogDensity ?? 0.08);
    }
    voxelView.syncAll();
    emitChangeSoon();
    emitSlice();
    bus.emit("terrainGenerated", result);
    return result;
  }

  // World mode: optional auto terrain when starting empty.
  const wantTerrain =
    mode === "world" &&
    options.terrain !== false &&
    (!options.volume || !Array.isArray(options.volume.voxels) || options.volume.voxels.length === 0);

  if (wantTerrain) {
    const tOpts = typeof options.terrain === "object" ? options.terrain : {};
    const seed =
      options.seed ??
      options.volume?.seed ??
      hashSeed("voxie-world", worldSize.x, worldSize.y, worldSize.z, "default");
    const boot = generateTerrain(grid, seed, tOpts);
    const bootBiome = getBiome(tOpts.biome || boot.biome || "greenery");
    if (tOpts.fog !== false && bootBiome.fogHex) {
      lightCtl.setBiomeFog(bootBiome.fogHex, bootBiome.fogDensity ?? 0.08);
    }
  }

  voxelView.syncAll();
  if (mode === "world" && charOpts) ensurePawns();

  function emitSlice() {
    bus.emit("sliceChange", { axis: grid.axis, slice: grid.slice });
    bus.emit("onSliceChange", { axis: grid.axis, slice: grid.slice });
  }

  function emitChange() {
    const vol = grid.exportVolume();
    assetCache.rememberVolume("live", vol);
    bus.emit("change", vol);
    bus.emit("onChange", vol);
  }

  function emitChangeSoon() {
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => {
      emitTimer = 0;
      emitChange();
    }, EMIT_DEBOUNCE_MS);
  }

  chunkGen = createChunkGenController({
    grid,
    voxelView,
    scene,
    emit: (type, payload) => bus.emit(type, payload),
    emitChange: emitChangeSoon,
    isPotato: () => !!state.potatoMode,
  });
  if (mode === "world") {
    const biomeHint =
      (typeof options.terrain === "object" && options.terrain?.biome) || "greenery";
    chunkGen.ensureOriginRecorded(grid.seed ?? options.seed, biomeHint);
  }

  /**
   * Incremental mesh update — never respawns pawns.
   * @param {Array<{x:number,y:number,z:number}>} [touched]
   */
  api._notifyVolumeChange = (touched) => {
    if (touched?.length) voxelView.syncCells(touched);
    else voxelView.syncAll();
    emitChangeSoon();
  };

  // --- Undo / redo ---
  api.history = history;

  api.getHistoryState = () => ({
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
    undoLen: history._stacks().undo.length,
    redoLen: history._stacks().redo.length,
  });

  api.clearHistory = () => {
    history.clear();
    bus.emit("historyChange", api.getHistoryState());
  };

  /**
   * Capture before-state for cells, run mutator, push compact diff (async-friendly).
   * @param {string} label
   * @param {Array<{x:number,y:number,z:number}|string>} cellsOrKeys
   * @param {() => void} mutate
   * @param {{ includeGroups?: boolean, sync?: boolean }} [opts]
   */
  api.recordEdit = (label, cellsOrKeys, mutate, opts = {}) => {
    if (history.isSuppressed()) {
      mutate?.();
      return 0;
    }
    const keys = (cellsOrKeys || []).map((c) =>
      typeof c === "string" ? c : voxelKey(c.x, c.y, c.z)
    );
    const before = {};
    for (const k of keys) before[k] = history.snapKey(grid, k);
    const groupsBefore = opts.includeGroups !== false ? groups.exportGroups() : undefined;
    mutate?.();
    const after = {};
    for (const k of Object.keys(before)) after[k] = history.snapKey(grid, k);
    // Include newly touched keys from mutate if caller passes them again via opts.extraKeys
    if (opts.extraKeys) {
      for (const c of opts.extraKeys) {
        const k = typeof c === "string" ? c : voxelKey(c.x, c.y, c.z);
        if (!(k in before)) before[k] = null;
        after[k] = history.snapKey(grid, k);
      }
    }
    const push = () => {
      history.push({
        label: label || "edit",
        before,
        after,
        ...(groupsBefore ? { groupsBefore, groupsAfter: groups.exportGroups() } : {}),
      });
    };
    // Potato / large diffs: defer push one frame so mesh sync stays snappy
    if (state.potatoMode || keys.length > 64) {
      requestAnimationFrame(push);
    } else {
      push();
    }
    return keys.length;
  };

  /**
   * Record an already-applied brush stroke from before/after maps.
   * Used by ForgeInput (captures before set/remove).
   */
  api._pushVoxelDiff = (label, before, after, groupsBefore) => {
    if (history.isSuppressed()) return false;
    const run = () =>
      history.push({
        label: label || "brush",
        before: before || {},
        after: after || {},
        ...(groupsBefore
          ? { groupsBefore, groupsAfter: groups.exportGroups() }
          : {}),
      });
    if (state.potatoMode) requestAnimationFrame(run);
    else run();
    return true;
  };

  api._snapCell = (x, y, z) => history.snapKey(grid, voxelKey(x, y, z));

  function applyHistoryNotify(touched) {
    syncGroupsToGrid();
    if (touched?.length) voxelView.syncCells(touched);
    else voxelView.syncAll();
    bus.emit("groupsChange", groups.list());
    emitChangeSoon();
  }

  api.undo = () => {
    const n = history.undo({
      grid,
      groups,
      notify: applyHistoryNotify,
    });
    bus.emit("historyChange", api.getHistoryState());
    return n;
  };

  api.redo = () => {
    const n = history.redo({
      grid,
      groups,
      notify: applyHistoryNotify,
    });
    bus.emit("historyChange", api.getHistoryState());
    return n;
  };

  api._onVolumeResized = () => {
    const ws = grid.worldSize;
    const fp = Math.max(ws.x, ws.z);
    if (cam.setMaxDistance) cam.setMaxDistance(fp * 5);
    else cam.controls.maxDistance = fp * 5;
    cam.camera.far = state.potatoMode ? Math.max(120, fp * 6) : Math.max(500, fp * 14);
    cam.camera.updateProjectionMatrix();
    axisGizmo.setLength?.(Math.max(3, Math.min(8, fp * 0.2)));
    voxelView.syncAll();
    emitChangeSoon();
    bus.emit("volumeResize", ws);
  };

  /** Grow grid bounds only — caller should `_onVolumeResized` after a stroke. */
  api.expandToInclude = (x, y, z) => grid.expandToInclude(x, y, z);

  api.setWorldSize = (size) => {
    const ws = grid.setWorldSize(size);
    api._onVolumeResized();
    emitChangeSoon();
    return ws;
  };

  api.getAutoExpand = () => state.autoExpand;
  api.setAutoExpand = (on) => {
    state.autoExpand = !!on;
    return state.autoExpand;
  };

  api.setAxisGizmoVisible = (on) => {
    // Placement gizmos belong in world mode; part/asset sculpt never shows RGB arrows.
    const allow = grid.mode === "world";
    state.showAxisGizmo = allow && !!on;
    axisGizmo.setVisible(state.showAxisGizmo);
    bus.emit("axisGizmoChange", state.showAxisGizmo);
    return state.showAxisGizmo;
  };

  api.toggleAxisGizmo = () => api.setAxisGizmoVisible(!state.showAxisGizmo);
  api.getAxisGizmoVisible = () => state.showAxisGizmo;

  /**
   * POTATO PC MODE — low-cost rendering / authoring defaults.
   * Does not enable preview pawns.
   * Borders: soft-default Off only when first enabling; setBorder remains free afterward.
   */
  api.setPotatoMode = (on) => {
    const next = !!on;
    const enabling = next && !state.potatoMode;
    state.potatoMode = next;
    if (state.potatoMode) {
      if (enabling) {
        state.borders = false;
        voxelView.setBorders(false);
        // Sensible low-cost GPU/CPU defaults when first enabling potato.
        state.gpuPowerPreference = "low-power";
        state.antialias = false;
        state.shaderPrecision = "mediump";
        if (state.meshWorkerThreads === "auto" || state.meshWorkerThreads > 1) {
          state.meshWorkerThreads = 1;
          state.meshWorker = true;
          voxelView.setMeshWorkerThreads?.(1);
        }
      }
      state.noiseTint = false;
      state.shadows = false;
      voxelView.setPotatoMode(true);
      ensureWebGLContext("potato-on");
      applyPixelRatio();
      lightCtl.refreshShadows();
      axisGizmo.setAnimate(false);
      const fp = Math.max(grid.worldSize.x, grid.worldSize.z);
      cam.camera.far = Math.max(120, fp * 6);
      cam.camera.updateProjectionMatrix();
    } else {
      voxelView.setPotatoMode(false);
      ensureWebGLContext("potato-off");
      applyPixelRatio();
      lightCtl.refreshShadows();
      axisGizmo.setAnimate(true);
      const fp = Math.max(grid.worldSize.x, grid.worldSize.z);
      cam.camera.far = Math.max(500, fp * 14);
      cam.camera.updateProjectionMatrix();
    }
    bus.emit("potatoModeChange", state.potatoMode);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.potatoMode;
  };

  api.getPotatoMode = () => state.potatoMode;

  api.setShadows = (on) => {
    // Pref only — maps stay off until a user light exists (see lightCtl).
    state.shadows = state.potatoMode ? false : !!on;
    lightCtl.refreshShadows();
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.shadows;
  };
  api.getShadows = () => state.shadows;

  /**
   * Place a sun (directional) or point light marker. Enables lit materials + optional shadows.
   * @param {{ kind?: 'sun'|'point', x?: number, y?: number, z?: number, intensity?: number, color?: string, id?: string }} [opts]
   */
  api.placeLight = (opts = {}) => {
    const pivot = cam?.controls?.target;
    const def = lightCtl.placeLight({
      kind: opts.kind || "sun",
      x: opts.x ?? (pivot ? pivot.x + 6 : 4),
      y: opts.y ?? (pivot ? pivot.y + 12 : 10),
      z: opts.z ?? (pivot ? pivot.z + 4 : 6),
      intensity: opts.intensity,
      color: opts.color,
      id: opts.id,
    });
    bus.emit("lightsChange", lightCtl.listLights());
    return def;
  };
  api.clearLights = () => {
    lightCtl.clearLights();
    bus.emit("lightsChange", []);
  };
  api.getLights = () => lightCtl.listLights();
  api.hasLights = () => lightCtl.hasLights();
  api.setBiomeFog = (hex, density) => lightCtl.setBiomeFog(hex, density);

  api.setMeshMode = (mode) => {
    const m = voxelView.setMeshMode?.(mode);
    bus.emit("perfChange", api.getPerformancePrefs());
    return m;
  };
  api.getMeshMode = () => voxelView.getMeshMode?.() || "instances";
  api.setBlockTextures = (on) => voxelView.setBlockTextures?.(on);

  api.setFpsLimit = (n) => {
    const v = Number(n) || 0;
    state.fpsLimit = [30, 60, 120].includes(v) ? v : 0;
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.fpsLimit;
  };
  api.getFpsLimit = () => state.fpsLimit;

  api.setPixelRatioCap = (n) => {
    const v = Number(n);
    state.pixelRatioCap = [0.5, 1, 1.5, 2].includes(v) ? v : 2;
    applyPixelRatio();
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.pixelRatioCap;
  };
  api.getPixelRatioCap = () => state.pixelRatioCap;

  // Overlay host is created later; visibility applied when nerd mounts.
  api.setShowFpsOverlay = (on) => {
    state.showFpsOverlay = !!on;
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.showFpsOverlay;
  };
  api.getShowFpsOverlay = () => state.showFpsOverlay;

  api.setChunkCoalesceMs = (ms) => {
    state.chunkCoalesceMs = Math.max(0, Math.min(250, Number(ms) || 0));
    voxelView.setRebuildCoalesceMs?.(state.chunkCoalesceMs);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.chunkCoalesceMs;
  };
  api.getChunkCoalesceMs = () => state.chunkCoalesceMs;

  api.setMaxDirtyChunksPerFrame = (n) => {
    state.maxDirtyChunksPerFrame = Math.max(0, Math.min(256, Number(n) || 0)) | 0;
    voxelView.setMaxDirtyChunksPerFrame?.(state.maxDirtyChunksPerFrame);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.maxDirtyChunksPerFrame;
  };
  api.getMaxDirtyChunksPerFrame = () => state.maxDirtyChunksPerFrame;

  api.setLodMode = (mode) => {
    state.lodMode = ["off", "distance", "center-cone"].includes(mode) ? mode : "off";
    voxelView.setLodMode?.(state.lodMode);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.lodMode;
  };
  api.getLodMode = () => state.lodMode;

  api.setLodNear = (n) => {
    state.lodNear = Math.max(4, Math.min(512, Number(n) || 28));
    if (state.lodFar < state.lodNear + 4) state.lodFar = state.lodNear + 4;
    voxelView.setLodNear?.(state.lodNear);
    voxelView.setLodFar?.(state.lodFar);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.lodNear;
  };
  api.getLodNear = () => state.lodNear;

  api.setLodFar = (n) => {
    state.lodFar = Math.max(state.lodNear + 4, Math.min(1024, Number(n) || 72));
    voxelView.setLodFar?.(state.lodFar);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.lodFar;
  };
  api.getLodFar = () => state.lodFar;

  api.setBordersNearOnly = (on) => {
    state.bordersNearOnly = !!on;
    voxelView.setBordersNearOnly?.(state.bordersNearOnly);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.bordersNearOnly;
  };
  api.getBordersNearOnly = () => state.bordersNearOnly;

  api.setRenderPath = (path) => {
    state.renderPath = path === "cpu-lite" ? "cpu-lite" : "gpu";
    voxelView.setRenderPath?.(state.renderPath);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.renderPath;
  };
  api.getRenderPath = () => state.renderPath;

  api.setMaxInstances = (n) => {
    state.maxInstances = Math.max(0, Math.min(2_000_000, Number(n) || 0)) | 0;
    voxelView.setMaxInstances?.(state.maxInstances);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.maxInstances;
  };
  api.getMaxInstances = () => state.maxInstances;

  api.setMeshWorker = (on) => {
    if (on) {
      if (state.meshWorkerThreads === 0) state.meshWorkerThreads = "auto";
    } else {
      state.meshWorkerThreads = 0;
    }
    state.meshWorker = state.meshWorkerThreads !== 0;
    voxelView.setMeshWorkerThreads?.(state.meshWorkerThreads);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.meshWorker;
  };
  api.getMeshWorker = () => state.meshWorker;

  /**
   * CPU threads for meshing: 0 (main only) | 1 | 2 | 'auto'.
   * @param {0|1|2|'auto'|string|number} n
   */
  api.setMeshWorkerThreads = (n) => {
    let next = n;
    if (next === 0 || next === "0") next = 0;
    else if (next === 1 || next === "1") next = 1;
    else if (next === 2 || next === "2") next = 2;
    else next = "auto";
    state.meshWorkerThreads = next;
    state.meshWorker = next !== 0;
    voxelView.setMeshWorkerThreads?.(state.meshWorkerThreads);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.meshWorkerThreads;
  };
  api.getMeshWorkerThreads = () => state.meshWorkerThreads;
  api.getMeshWorkerCount = () => voxelView.getMeshWorkerCount?.() ?? 0;

  /**
   * WebGL powerPreference — recreates the renderer/context when it changes.
   * @param {'default'|'low-power'|'high-performance'} pref
   */
  api.setGpuPowerPreference = (pref) => {
    state.gpuPowerPreference = ["default", "low-power", "high-performance"].includes(pref)
      ? pref
      : "high-performance";
    ensureWebGLContext("powerPreference");
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.gpuPowerPreference;
  };
  api.getGpuPowerPreference = () => state.gpuPowerPreference;

  /** MSAA antialias (context attr — recreates renderer on change). */
  api.setAntialias = (on) => {
    state.antialias = state.potatoMode ? false : !!on;
    ensureWebGLContext("antialias");
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.antialias;
  };
  api.getAntialias = () => state.antialias;

  /**
   * Shader precision mediump|highp (WebGLRenderer precision — recreates on change).
   * @param {'mediump'|'highp'} p
   */
  api.setShaderPrecision = (p) => {
    state.shaderPrecision = p === "mediump" ? "mediump" : "highp";
    ensureWebGLContext("precision");
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.shaderPrecision;
  };
  api.getShaderPrecision = () => state.shaderPrecision;

  api.setSkipIdleRender = (on) => {
    state.skipIdleRender = !!on;
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.skipIdleRender;
  };
  api.getSkipIdleRender = () => state.skipIdleRender;

  /**
   * Semi-potato: LOD distance + borders near-only + pixel ratio 1 (not full potato).
   */
  api.applySemiPotatoPreset = () =>
    api.applyPerformancePrefs({
      potatoMode: false,
      lodMode: "distance",
      bordersNearOnly: true,
      borders: true,
      pixelRatioCap: 1,
      gpuPowerPreference: "low-power",
      antialias: false,
      meshWorkerThreads: 1,
      shaderPrecision: "mediump",
    });

  api.getPerformancePrefs = () => ({
    fpsLimit: state.fpsLimit,
    pixelRatioCap: state.pixelRatioCap,
    potatoMode: state.potatoMode,
    shadows: state.shadows,
    borders: state.borders,
    noiseTint: state.noiseTint,
    chunkCoalesceMs: state.chunkCoalesceMs,
    maxDirtyChunksPerFrame: state.maxDirtyChunksPerFrame,
    showFpsOverlay: state.showFpsOverlay,
    lodMode: state.lodMode,
    lodNear: state.lodNear,
    lodFar: state.lodFar,
    bordersNearOnly: state.bordersNearOnly,
    renderPath: state.renderPath,
    maxInstances: state.maxInstances,
    meshWorker: state.meshWorker,
    meshWorkerThreads: state.meshWorkerThreads,
    meshMode: voxelView.getMeshMode?.() || "instances",
    blockTextures: voxelView.getBlockTextures?.() !== false,
    gpuPowerPreference: state.gpuPowerPreference,
    antialias: state.antialias,
    shaderPrecision: state.shaderPrecision,
    skipIdleRender: state.skipIdleRender,
  });

  /**
   * Apply a batch of performance prefs (from Performance panel / localStorage).
   * Does not force potato side-effects twice when already matching.
   * Note: GPU context attrs (powerPreference / antialias / precision) recreate WebGL.
   */
  api.applyPerformancePrefs = (prefs = {}) => {
    if (prefs.potatoMode != null && !!prefs.potatoMode !== state.potatoMode) {
      api.setPotatoMode(prefs.potatoMode);
    }
    if (prefs.fpsLimit != null) api.setFpsLimit(prefs.fpsLimit);
    if (prefs.pixelRatioCap != null) api.setPixelRatioCap(prefs.pixelRatioCap);
    if (prefs.renderPath != null) api.setRenderPath(prefs.renderPath);
    if (prefs.meshWorkerThreads != null) api.setMeshWorkerThreads(prefs.meshWorkerThreads);
    else if (prefs.meshWorker != null) api.setMeshWorker(prefs.meshWorker);
    if (prefs.chunkCoalesceMs != null) api.setChunkCoalesceMs(prefs.chunkCoalesceMs);
    if (prefs.maxDirtyChunksPerFrame != null) {
      api.setMaxDirtyChunksPerFrame(prefs.maxDirtyChunksPerFrame);
    }
    if (prefs.maxInstances != null) api.setMaxInstances(prefs.maxInstances);
    if (prefs.lodMode != null) api.setLodMode(prefs.lodMode);
    if (prefs.lodNear != null) api.setLodNear(prefs.lodNear);
    if (prefs.lodFar != null) api.setLodFar(prefs.lodFar);
    if (prefs.bordersNearOnly != null) api.setBordersNearOnly(prefs.bordersNearOnly);
    if (prefs.skipIdleRender != null) api.setSkipIdleRender(prefs.skipIdleRender);
    if (prefs.showFpsOverlay != null) api.setShowFpsOverlay(prefs.showFpsOverlay);
    if (prefs.shadows != null && !state.potatoMode) api.setShadows(prefs.shadows);
    // Borders independent of potato — always honor explicit pref when provided.
    if (prefs.borders != null) api.setBorder(prefs.borders);
    if (prefs.meshMode != null) api.setMeshMode(prefs.meshMode);
    if (prefs.blockTextures != null) api.setBlockTextures(prefs.blockTextures);
    if (prefs.gpuPowerPreference != null) api.setGpuPowerPreference(prefs.gpuPowerPreference);
    if (prefs.antialias != null) api.setAntialias(prefs.antialias);
    if (prefs.shaderPrecision != null) api.setShaderPrecision(prefs.shaderPrecision);
    return api.getPerformancePrefs();
  };

  function syncPivotAfterSlice() {
    cam.syncPivotToEditPlane?.(grid.axis, grid.slice);
  }

  api.setAxis = (axis) => {
    grid.setAxis(axis);
    voxelView.updateEditPlane();
    voxelView.applyVisibility();
    syncPivotAfterSlice();
    emitSlice();
    return grid.axis;
  };

  api.cycleAxis = () => {
    grid.cycleAxis();
    voxelView.updateEditPlane();
    voxelView.applyVisibility();
    syncPivotAfterSlice();
    emitSlice();
    return grid.axis;
  };

  api.setSlice = (n) => {
    grid.setSlice(n | 0);
    voxelView.updateEditPlane();
    voxelView.applyVisibility();
    syncPivotAfterSlice();
    emitSlice();
    return grid.slice;
  };

  api.nudgeSlice = (delta) => {
    const step = delta > 0 ? 1 : delta < 0 ? -1 : 0;
    if (!step) return grid.slice;
    return api.setSlice(grid.slice + step);
  };

  api.setPaintDrag = (on) => {
    state.paintDrag = !!on;
    bus.emit("prefsChange", { paintDrag: state.paintDrag });
    return state.paintDrag;
  };
  api.getPaintDrag = () => !!state.paintDrag;

  api.setSnapMode = (mode) => {
    state.snapMode = mode === "free" ? "free" : "block";
    bus.emit("snapModeChange", state.snapMode);
    return state.snapMode;
  };
  api.getSnapMode = () => state.snapMode;

  api.setCamMoveSpeed = (speed) => cam.setMoveSpeed?.(speed) ?? speed;
  api.getCamMoveSpeed = () => cam.getMoveSpeed?.() ?? 10;
  api.setCamKeyboardGridSnap = (on) => cam.setKeyboardGridSnap?.(on) ?? !!on;
  api.getCamKeyboardGridSnap = () => !!cam.getKeyboardGridSnap?.();

  api.setLayerMode = (modeName) => {
    if (!LAYER_MODES.includes(modeName)) return state.layerMode;
    state.layerMode = modeName;
    voxelView.setLayerMode(modeName);
    return state.layerMode;
  };

  api.setColorHSB = (h, s, b) => {
    state.h = clamp(h, 0, 360);
    state.s = clamp(s, 0, 100);
    state.b = clamp(b, 0, 100);
    bus.emit("colorChange", api.getColorHSB());
    return api.getColorHSB();
  };

  api.setColorHex = (hex) => {
    const hsb = hexToHsb(normalizeHex(hex));
    return api.setColorHSB(hsb.h, hsb.s, hsb.b);
  };

  api.getColorHSB = () => ({ h: state.h, s: state.s, b: state.b });
  api.getColorHex = () => state.colorHex;

  api._rememberPaintColor = (hex) => {
    rememberLastColor(hex || state.colorHex);
    bus.emit("swatchesChange", { last: swatches.getLast(), favourites: swatches.getFavourites() });
  };
  api.swatches = swatches;

  api.setBorder = (on) => {
    state.borders = !!on;
    voxelView.setBorders(state.borders);
    return state.borders;
  };

  api.getBorder = () => state.borders;

  api.setTool = (tool) => {
    const prev = state.tool;
    state.tool = normalizeTool(tool);
    // Exclusive input mode: registry lifecycle + clear ghosts when leaving stamp tools.
    applyToolLifecycle(api, prev, state.tool);
    if (state.tool !== "place") voxelView.setRollOver(null, state.colorHex, false);
    if (
      state.tool !== "place" &&
      state.tool !== "generate" &&
      state.tool !== "shape" &&
      state.tool !== "stroke"
    ) {
      voxelView.clearPreviewCells?.();
    }
    bus.emit("toolChange", state.tool, { prev, panel: getPanelIdForTool(state.tool) });
    return state.tool;
  };

  api.shapeGen = shapeGen;

  api.setShapeGenType = (id) => {
    const t = shapeGen.setType(id);
    bus.emit("shapeGenChange", shapeGen.getParams());
    return t;
  };

  api.setShapeGenParams = (opts = {}) => {
    const p = shapeGen.setParams(opts);
    bus.emit("shapeGenChange", p);
    return p;
  };

  api.getShapeGenParams = () => shapeGen.getParams();

  api.rerollShapeGen = () => {
    const s = shapeGen.reroll();
    bus.emit("shapeGenChange", shapeGen.getParams());
    return s;
  };

  api.getTool = () => state.tool;

  api.setBrushSize = (n) => {
    state.brushSize = n === 3 ? 3 : 1;
    if (n === 3) {
      state.brushW = 3;
      state.brushH = 3;
    } else if (n === 1) {
      state.brushW = 1;
      state.brushH = 1;
    }
    return state.brushSize;
  };

  api.getBrushSize = () => state.brushSize;

  api.setBrushRect = (w, h) => {
    state.brushW = Math.max(1, Math.min(32, w | 0));
    state.brushH = Math.max(1, Math.min(32, h | 0));
    state.brushShape = "rect";
    state.brushSize = state.brushW >= 3 && state.brushH >= 3 ? 3 : 1;
    bus.emit("brushChange", api.getBrushState());
    return api.getBrushState();
  };

  api.setBrushShape = (shape) => {
    state.brushShape = shape === "circle" ? "circle" : "rect";
    bus.emit("brushChange", api.getBrushState());
    return state.brushShape;
  };

  api.setCircleRadius = (r) => {
    state.circleRadius = Math.max(1, Math.min(16, r | 0));
    state.brushShape = "circle";
    bus.emit("brushChange", api.getBrushState());
    return state.circleRadius;
  };

  api.getBrushState = () => ({
    brushW: state.brushW,
    brushH: state.brushH,
    brushShape: state.brushShape,
    circleRadius: state.circleRadius,
    brushSize: state.brushSize,
  });

  api.setShapeId = (id) => {
    state.shapeId = ["rect", "diamond", "line"].includes(id) ? id : "rect";
    bus.emit("shapeChange", state.shapeId);
    return state.shapeId;
  };

  api.setStrokeOptions = (opts = {}) => {
    if (opts.length != null) state.strokeLength = Math.max(1, Math.min(64, opts.length | 0));
    if (opts.smooth != null) state.strokeSmooth = !!opts.smooth;
    if (opts.asGroup != null) state.strokeAsGroup = !!opts.asGroup;
    bus.emit("strokeChange", {
      length: state.strokeLength,
      smooth: state.strokeSmooth,
      asGroup: state.strokeAsGroup,
    });
    return { length: state.strokeLength, smooth: state.strokeSmooth, asGroup: state.strokeAsGroup };
  };

  api.setIsolatePart = (on) => {
    state.isolatePart = !!on;
    voxelView.setIsolatePart(state.isolatePart);
    return state.isolatePart;
  };

  api.setPartId = (id) => {
    grid.setPartId(id);
    voxelView.applyVisibility();
    return grid.partId;
  };

  function syncGroupsToGrid() {
    grid.setGroups(groups.exportGroups());
  }

  api.exportVolume = () => {
    syncGroupsToGrid();
    const vol = grid.exportVolume();
    const textures = textureStore.exportAll();
    const meta = { ...(vol.meta || {}) };
    if (Object.keys(textures).length) meta.textures = textures;
    if (pawns) meta.characterHeightBlocks = pawns.getHeightBlocks();
    // Persist chunk map for reload / regenerate (baked voxels stay in volume).
    const chunks = chunkGen?.getChunkMap?.() || readChunkMeta(meta);
    if (chunks && (Object.keys(chunks.map).length || chunks.chunkSize)) {
      meta.chunks = {
        chunkSize: chunks.chunkSize,
        height: Math.max(chunks.height, grid.worldSize.y),
        map: { ...chunks.map },
      };
    }
    if (Object.keys(meta).length) vol.meta = meta;
    else delete vol.meta;
    return vol;
  };

  api.importVolume = (data) => {
    chunkGen?.cancel?.();
    grid.importVolume(data);
    groups.importGroups(data?.groups || grid.groups);
    if (data?.meta?.textures) textureStore.importAll(data.meta.textures);
    voxelView.syncAll();
    if (grid.mode === "world") {
      chunkGen?.ensureOriginRecorded?.(grid.seed, data?.meta?.chunks?.map?.["0,0"]?.biome || "greenery");
    }
    if (pawns && Number.isFinite(data?.meta?.characterHeightBlocks)) {
      pawns.setHeightBlocks(data.meta.characterHeightBlocks);
    }
    assetCache.rememberVolume("imported", api.exportVolume());
    // Fresh document / bend session — clear undo
    history.clear();
    bus.emit("groupsChange", groups.list());
    bus.emit("texturesChange", textureStore.list());
    bus.emit("historyChange", api.getHistoryState());
    emitChange();
    emitSlice();
    return api.exportVolume();
  };

  api.clear = () => {
    const keys = grid.all().map((v) => voxelKey(v.x, v.y, v.z));
    api.recordEdit("clear", keys, () => {
      grid.clear();
      groups.clear();
      grid.setGroups([]);
    }, { includeGroups: true });
    voxelView.syncAll();
    bus.emit("groupsChange", groups.list());
    emitChange();
  };

  /**
   * Resolve per-cell place color.
   * Exact paint swatch unless noise tint pref is explicitly ON (or texturizer applies later).
   * Group recording does NOT override color — membership only.
   */
  api.resolvePlaceColor = (x, y, z) => {
    const base = state.colorHex;
    if (!state.noiseTint) return base;
    return resolveMaterialColor({
      baseHex: base,
      noiseEnabled: true,
      noiseAmount: state.noiseAmount,
      materialId: state.materialId,
      x,
      y,
      z,
    });
  };

  api.setNoiseTint = (on) => {
    state.noiseTint = !!on;
    bus.emit("prefsChange", { noiseTint: state.noiseTint });
    return state.noiseTint;
  };

  api.getNoiseTint = () => state.noiseTint;

  api.setNoiseAmount = (n) => {
    state.noiseAmount = clamp(Number(n) || 0, 0, 0.5);
    return state.noiseAmount;
  };

  api.setMaterialId = (id) => {
    const preset = id ? getMaterialPreset(id) : null;
    state.materialId = preset ? preset.id : null;
    if (preset) api.setColorHex(preset.color);
    bus.emit("materialChange", state.materialId);
    return state.materialId;
  };

  api.getMaterialId = () => state.materialId;

  api.setGridVisible = (on) => {
    state.showGrid = !!on;
    voxelView.setGridVisible(state.showGrid);
    return state.showGrid;
  };

  api.getGridVisible = () => state.showGrid;

  api.setSliceHelperVisible = (on) => voxelView.setSliceHelperVisible?.(!!on);

  api.getSliceHelperVisible = () => voxelView.getSliceHelperVisible?.() !== false;

  /**
   * Frame camera above/back at volume origin (edit-plane pinned) so floor grid +
   * empty workspace are visible. Used on part/asset New and part-mode boot.
   * @param {{ ensureGrid?: boolean, ensureSliceHelper?: boolean }} [opts]
   */
  api.frameWorkspace = (opts = {}) => {
    const ws = grid.worldSize;
    const fp = Math.max(ws.x, ws.y, ws.z, 8);
    if (opts.ensureGrid !== false) {
      state.showGrid = true;
      voxelView.setGridVisible(true);
    }
    if (opts.ensureSliceHelper !== false) {
      voxelView.setSliceHelperVisible?.(true);
    }
    // Rebuild floor helper (part Y=0 / contrast) after mode/size changes.
    voxelView.refreshHelpers?.();
    if (cam.setMaxDistance) cam.setMaxDistance(fp * 5);
    else if (cam.controls) cam.controls.maxDistance = fp * 5;
    cam.camera.far = state.potatoMode ? Math.max(120, fp * 6) : Math.max(500, fp * 14);
    cam.camera.updateProjectionMatrix();
    cam.frameWorkspace?.({
      gridSize: fp,
      axis: grid.axis,
      slice: grid.slice,
      maxDistance: fp * 5,
    });
    bus.emit("cameraFrame", {
      axis: grid.axis,
      slice: grid.slice,
      worldSize: { ...ws },
      showGrid: state.showGrid,
    });
    return {
      axis: grid.axis,
      slice: grid.slice,
      showGrid: state.showGrid,
      pivot: cam.getPivot?.() || null,
    };
  };

  /**
   * Switch build mode (part asset vs world) without disposing the controller.
   * Does not clear voxels — callers should import an empty volume for New.
   * @param {'part'|'world'} nextMode
   */
  api.setBuildMode = (nextMode) => {
    const m = normalizeMode(nextMode, grid.mode);
    grid.setMode(m);
    // Part/asset: hide pivot ball + force axes off. World: show pivot; axes via toggle.
    if (m !== "world") {
      state.showAxisGizmo = false;
      axisGizmo?.setVisible?.(false);
      cam.setPivotVisible?.(false);
    } else {
      cam.setPivotVisible?.(true);
    }
    // Pawns stay opt-in; do not auto-spawn on mode switch.
    bus.emit("modeChange", m);
    emitChange();
    return m;
  };

  // --- Groups API ---
  api.groups = groups;

  api.startGroup = (opts) => {
    const g = groups.startGroup({
      color: opts?.color || state.colorHex,
      name: opts?.name,
      id: opts?.id,
    });
    syncGroupsToGrid();
    bus.emit("groupsChange", groups.list());
    return g;
  };

  api.stopGroup = () => {
    const id = groups.stopGroup();
    syncGroupsToGrid();
    bus.emit("groupsChange", groups.list());
    return id;
  };

  api.selectGroup = (id) => {
    const g = groups.selectGroup(id);
    if (g?.color) api.setColorHex(g.color);
    bus.emit("groupsChange", groups.list());
    return g;
  };

  api.recolorGroup = (id, color) => {
    const hex = color || state.colorHex;
    const g = groups.getGroup(id);
    const keys = g?.voxelKeys || [];
    let n = 0;
    api.recordEdit("recolorGroup", keys, () => {
      n = groups.recolorGroup(id, hex, (x, y, z, c) => {
        const cell = grid.get(x, y, z);
        grid.set(x, y, z, c, cell?.partId || grid.partId);
      });
      syncGroupsToGrid();
    }, { includeGroups: true });
    voxelView.syncAll();
    bus.emit("groupsChange", groups.list());
    emitChange();
    return n;
  };

  api.applyGroupGradient = (id, axis, colorA, colorB) => {
    const g = groups.getGroup(id);
    const keys = g?.voxelKeys || [];
    let n = 0;
    api.recordEdit("groupGradient", keys, () => {
      n = groups.applyLinearGradient(
        id,
        axis || "y",
        colorA || "#2a2218",
        colorB || state.colorHex,
        (x, y, z, c) => {
          const cell = grid.get(x, y, z);
          grid.set(x, y, z, c, cell?.partId || grid.partId);
        }
      );
      syncGroupsToGrid();
    }, { includeGroups: true });
    voxelView.syncAll();
    bus.emit("groupsChange", groups.list());
    emitChange();
    return n;
  };

  api.applyGroupShade = (id, axis, amount) => {
    const g = groups.getGroup(id);
    const keys = g?.voxelKeys || [];
    let n = 0;
    api.recordEdit("groupShade", keys, () => {
      n = groups.applyShadeRamp(id, axis || "y", amount ?? 0.35, (x, y, z, c) => {
        const cell = grid.get(x, y, z);
        grid.set(x, y, z, c, cell?.partId || grid.partId);
      });
      syncGroupsToGrid();
    }, { includeGroups: true });
    voxelView.syncAll();
    bus.emit("groupsChange", groups.list());
    emitChange();
    return n;
  };

  /** Group current selection into a named group. */
  api.groupFromSelection = (opts = {}) => {
    const keys = selection.list();
    if (!keys.length) return null;
    const g = groups.groupFromKeys(keys, {
      color: opts.color || state.colorHex,
      name: opts.name,
      select: true,
    });
    syncGroupsToGrid();
    bus.emit("groupsChange", groups.list());
    emitChange();
    return g;
  };

  /**
   * Cluster volume (or selection) by color into Group #N.
   * @param {{ tolerance?: number, selectionOnly?: boolean, replace?: boolean }} [opts]
   */
  api.groupByColor = (opts = {}) => {
    const selKeys = opts.selectionOnly ? selection.list() : null;
    const created = groups.groupByColor(grid.all(), {
      tolerance: opts.tolerance ?? 0,
      selectionKeys: selKeys,
      replace: !!opts.replace,
    });
    syncGroupsToGrid();
    bus.emit("groupsChange", groups.list());
    emitChange();
    return created;
  };

  /**
   * Collective HSB / RGB channel apply on selected group(s).
   * @param {object} adj { hue, saturation, brightness, r, g, b, variety, varietyAmt }
   * @param {string|string[]|null} [ids]
   */
  api.applyGroupChannels = (adj = {}, ids = null) => {
    const list = ids == null ? groups.getSelectedIds() : Array.isArray(ids) ? ids : [ids];
    const keys = [];
    for (const id of list) {
      const g = groups.getGroup(id);
      if (g) keys.push(...g.voxelKeys);
    }
    let n = 0;
    api.recordEdit("groupChannels", keys, () => {
      n = groups.applyChannels(
        list,
        adj,
        (x, y, z) => grid.get(x, y, z)?.color || null,
        (x, y, z, c) => {
          const cell = grid.get(x, y, z);
          if (!cell) return;
          grid.set(x, y, z, { ...cell, color: c, textureId: null, texScale: null });
        }
      );
      syncGroupsToGrid();
    }, { includeGroups: true });
    if (n) {
      voxelView.syncCells(keys.map((k) => {
        const [x, y, z] = k.split("|").map(Number);
        return { x, y, z };
      }));
      bus.emit("groupsChange", groups.list());
      emitChange();
    }
    return n;
  };

  /**
   * After a Generate-shape stamp: make `{propName} #N` containing those voxels and select it.
   * Called from ForgeInput before the undo entry is pushed (so undo removes group + voxels).
   * @param {Array<{x:number,y:number,z:number,color?:string}>} cells
   */
  api._groupGenerateStamp = (cells) => {
    if (!cells?.length) return null;
    const prop = shapeGen.propName?.() || shapeGen.getParams().type || "shape";
    const name = groups.allocPropGroupName(prop);
    const keys = cells.map((c) => voxelKey(c.x, c.y, c.z));
    const g = groups.groupFromKeys(keys, {
      name,
      color: cells[0]?.color || state.colorHex,
      select: true,
    });
    syncGroupsToGrid();
    bus.emit("groupsChange", groups.list());
    return g;
  };

  /** Called by ForgeInput after brush apply. */
  api._onBrushApplied = (cells, brushMode, label) => {
    if (!cells?.length) return;
    // Generate stamps already own a dedicated group — skip recording addKeys.
    if (brushMode === "place" && label !== "generate") {
      groups.addKeys(cells.map((c) => voxelKey(c.x, c.y, c.z)));
    } else if (brushMode === "erase") {
      groups.removeKeys(cells.map((c) => voxelKey(c.x, c.y, c.z)));
      for (const c of cells) selection.removeKey(voxelKey(c.x, c.y, c.z));
    }
    syncGroupsToGrid();
    if (groups.isRecording() || brushMode === "erase" || label === "generate") {
      bus.emit("groupsChange", groups.list());
    }
  };

  // --- Selection ---
  api.selection = selection;
  let selAttrRaf = 0;
  selection.setOnChange((keys) => {
    // Overlay is rAF-throttled inside the renderer; attrs UI coalesced too.
    voxelView.setSelectionKeys?.(keys);
    if (selAttrRaf) return;
    selAttrRaf = requestAnimationFrame(() => {
      selAttrRaf = 0;
      bus.emit("selectionChange", api.getSelectionAttributes());
    });
  });

  api.getSelectionAttributes = () =>
    selection.attributes(grid, (key) => groups.groupIdForKey?.(key) ?? null);

  /**
   * Batch-recolor selection with current flat color (clears textureId).
   * Pass `{ texture: true }` to apply active/generated texture instead.
   */
  api.recolorSelection = (hex, opts = {}) => {
    if (opts?.texture) {
      return api.applyTexturizerToSelection?.() || 0;
    }
    const color = normalizeHex(hex || state.colorHex);
    const keys = selection.list();
    const touched = [];
    api.recordEdit("recolorSelection", keys, () => {
      for (const k of keys) {
        const [x, y, z] = k.split("|").map(Number);
        const cell = grid.get(x, y, z);
        if (!cell) continue;
        grid.set(x, y, z, { ...cell, color, textureId: null, texScale: null });
        touched.push({ x, y, z });
      }
    });
    // Single dirty-chunk coalesce via syncCells (rAF flush).
    if (touched.length) api._notifyVolumeChange(touched);
    bus.emit("selectionChange", api.getSelectionAttributes());
    return touched.length;
  };

  /** Natural top-light shade across selection (brightness ramp on Y). */
  api.shadeSelection = (axis = "y", amount = 0.35) => {
    const keys = selection.list();
    if (!keys.length) return 0;
    const ax = axis === "x" || axis === "y" || axis === "z" ? axis : "y";
    const amp = clamp(Number(amount) || 0.35, 0, 1);
    const cells = [];
    for (const k of keys) {
      const [x, y, z] = k.split("|").map(Number);
      const cell = grid.get(x, y, z);
      if (!cell) continue;
      cells.push({ x, y, z, color: cell.color, cell });
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
    const touched = [];
    for (const c of cells) {
      const t = (c[ax] - min) / span;
      const base = hexToHsb(c.color);
      const bri = clamp(base.b + (t - 0.5) * 2 * amp * 100, 8, 100);
      const color = hsbToHex(base.h, base.s, bri);
      grid.set(c.x, c.y, c.z, { ...c.cell, color, textureId: null, texScale: null });
      touched.push({ x: c.x, y: c.y, z: c.z });
    }
    if (touched.length) api._notifyVolumeChange(touched);
    bus.emit("selectionChange", api.getSelectionAttributes());
    return touched.length;
  };

  api.deleteSelection = () => {
    const keys = selection.list();
    const touched = [];
    api.recordEdit("deleteSelection", keys, () => {
      for (const k of keys) {
        const [x, y, z] = k.split("|").map(Number);
        if (grid.remove(x, y, z)) touched.push({ x, y, z });
      }
      groups.removeKeys(keys);
      syncGroupsToGrid();
    }, { includeGroups: true });
    selection.clear();
    if (touched.length) {
      api._notifyVolumeChange(touched);
      bus.emit("groupsChange", groups.list());
    }
    return touched.length;
  };

  // --- Effects ---
  api.listEffects = () => EFFECT_PRESETS;

  api.applyEffectToSelection = (effectId, opts) => {
    const keys = selection.list();
    if (!keys.length) return 0;
    const painted = applyEffectToKeys(
      keys,
      (x, y, z) => grid.get(x, y, z)?.color || null,
      effectId,
      opts
    );
    const touched = [];
    for (const p of painted) {
      const cell = grid.get(p.x, p.y, p.z);
      if (!cell) continue;
      grid.set(p.x, p.y, p.z, { ...cell, color: p.color });
      touched.push(p);
    }
    if (touched.length) api._notifyVolumeChange(touched);
    bus.emit("selectionChange", api.getSelectionAttributes());
    return touched.length;
  };

  api.applyEffectToGroup = (groupId, effectId, opts) => {
    const g = groups.exportGroups().find((x) => x.id === groupId);
    if (!g) return 0;
    const painted = applyEffectToKeys(
      g.voxelKeys,
      (x, y, z) => grid.get(x, y, z)?.color || null,
      effectId,
      opts
    );
    const touched = [];
    for (const p of painted) {
      const cell = grid.get(p.x, p.y, p.z);
      if (!cell) continue;
      grid.set(p.x, p.y, p.z, { ...cell, color: p.color });
      touched.push(p);
    }
    if (touched.length) api._notifyVolumeChange(touched);
    return touched.length;
  };

  // --- Texturizer + texture pack / browser ---
  api.textures = textureStore;
  api.assetBrowser = assetBrowser;

  api.createTexturizer = (opts) => {
    const def = textureStore.create(opts || { weights: [{ hex: state.colorHex, weight: 1 }] });
    if (def) {
      state.activeTextureId = def.id;
      state.texScale = def.size;
      assetBrowser.registerTexture(def, true);
      bus.emit("texturesChange", textureStore.list());
    }
    return def;
  };

  api.setActiveTexture = (id) => {
    state.activeTextureId = id || null;
    const def = id ? textureStore.get(id) : null;
    if (def) state.texScale = def.size;
    bus.emit("activeTextureChange", state.activeTextureId);
    return state.activeTextureId;
  };

  api.setTexScale = (n) => {
    state.texScale = n >= 16 ? 16 : 8;
    return state.texScale;
  };

  api.applyTexturizerToCells = (cells) => {
    const def =
      (state.activeTextureId && textureStore.get(state.activeTextureId)) ||
      textureStore.create({
        weights: [{ hex: state.colorHex, weight: 1 }],
        size: state.texScale,
      });
    if (!def) return 0;
    state.activeTextureId = def.id;
    const flat = state.potatoMode;
    const painted = applyTexturizerToCells(cells, def, "replace");
    const touched = [];
    for (const p of painted) {
      if (!grid.inBounds(p.x, p.y, p.z)) {
        if (api.getAutoExpand?.() !== false) api.expandToInclude?.(p.x, p.y, p.z);
        else continue;
      }
      const color = flat ? p.color : p.color;
      grid.set(p.x, p.y, p.z, {
        color,
        partId: grid.partId,
        textureId: flat ? null : def.id,
        texScale: flat ? null : def.size,
      });
      touched.push(p);
    }
    if (touched.length) {
      api._onBrushApplied?.(touched, "place");
      api._notifyVolumeChange(touched);
    }
    return touched.length;
  };

  api.applyTexturizerToSelection = () => {
    const cells = selection.list().map((k) => {
      const [x, y, z] = k.split("|").map(Number);
      return { x, y, z };
    });
    return api.applyTexturizerToCells(cells);
  };

  api.applyTexturizerToGroup = (groupId) => {
    const id = groupId || groups.getSelectedId();
    const g = id ? groups.getGroup(id) : null;
    if (!g?.voxelKeys?.length) return 0;
    const cells = g.voxelKeys.map((k) => {
      const [x, y, z] = String(k).split("|").map(Number);
      return { x, y, z };
    });
    return api.applyTexturizerToCells(cells);
  };

  api.exportTexturePack = () => {
    const pack = packTextures(textureStore.exportAll());
    downloadTexturePack(pack);
    return pack.manifest;
  };

  api.importTextureShard = (doc) => {
    const map = doc?.textures || doc;
    if (!map || typeof map !== "object") return 0;
    textureStore.importAll(map);
    for (const def of textureStore.list()) assetBrowser.registerTexture(def, false);
    bus.emit("texturesChange", textureStore.list());
    return textureStore.list().length;
  };

  api.getMode = () => grid.mode;
  api.getWorldSize = () => grid.worldSize;
  api.getSeed = () => grid.seed;

  api.generateTerrain = (seed, terrainOpts) => {
    if (grid.mode !== "world") grid.setMode("world");
    return runTerrain(seed, terrainOpts);
  };

  /** Biome ids available for Add chunk / terrain. */
  api.getBiomeIds = () => [...BIOME_IDS];
  api.getBiome = (id) => getBiome(id);
  api.getChunkMap = () => chunkGen?.getChunkMap?.() || readChunkMeta(grid.meta);

  /**
   * Preview neighbor chunk footprints (pulsing outline) without generating.
   * @param {string|string[]} dirs N/E/S/W
   * @param {{ biome?: string }} [opts]
   */
  api.previewWorldChunks = (dirs, opts = {}) => {
    if (grid.mode !== "world") return [];
    return chunkGen?.previewDirections?.(dirs, opts) || [];
  };

  api.clearChunkPreview = () => chunkGen?.clearPreview?.();

  /**
   * Add adjoining world chunks (batched fill + glow until complete).
   * @param {{ dirs: string|string[], biome?: string, seed?: number, height?: number }} opts
   */
  api.addWorldChunks = (opts = {}) => {
    if (grid.mode !== "world") grid.setMode("world");
    return chunkGen?.addChunks?.(opts) || { added: [], promise: Promise.resolve({ added: [] }) };
  };

  api.cancelWorldChunks = () => chunkGen?.cancel?.() || false;
  api.isWorldChunkGenBusy = () => !!chunkGen?.isBusy?.();

  api.setCharacterHeight = (blocks) => {
    if (!pawns) return null;
    const h = pawns.setHeightBlocks(blocks);
    bus.emit("characterHeightChange", h);
    return h;
  };

  api.getCharacterHeight = () => (pawns ? pawns.getHeightBlocks() : null);

  api.respawnCharacters = () => {
    if (pawns) pawns.respawn();
  };

  api.onChange = (fn) => bus.on("change", fn);
  api.onSliceChange = (fn) => bus.on("sliceChange", fn);
  api.on = (type, fn) => bus.on(type, fn);
  api.off = (type, fn) => bus.off(type, fn);

  api.getAxis = () => grid.axis;
  api.getSlice = () => grid.slice;
  api.getLayerMode = () => state.layerMode;
  api.getSize = () => grid.size;

  api.getState = () => ({
    mode: grid.mode,
    worldSize: grid.worldSize,
    seed: grid.seed,
    tool: state.tool,
    paintDrag: state.paintDrag,
    snapMode: state.snapMode,
    brushSize: state.brushSize,
    brushW: state.brushW,
    brushH: state.brushH,
    brushShape: state.brushShape,
    circleRadius: state.circleRadius,
    shapeId: state.shapeId,
    shapeGen: shapeGen.getParams(),
    strokeLength: state.strokeLength,
    strokeSmooth: state.strokeSmooth,
    strokeAsGroup: state.strokeAsGroup,
    activeTextureId: state.activeTextureId,
    texScale: state.texScale,
    borders: state.borders,
    layerMode: state.layerMode,
    isolatePart: state.isolatePart,
    showGrid: state.showGrid,
    noiseTint: state.noiseTint,
    noiseAmount: state.noiseAmount,
    materialId: state.materialId,
    autoExpand: state.autoExpand,
    showAxisGizmo: state.showAxisGizmo,
    potatoMode: state.potatoMode,
    fpsLimit: state.fpsLimit,
    pixelRatioCap: state.pixelRatioCap,
    shadows: state.shadows,
    chunkCoalesceMs: state.chunkCoalesceMs,
    maxDirtyChunksPerFrame: state.maxDirtyChunksPerFrame,
    showFpsOverlay: state.showFpsOverlay,
    lodMode: state.lodMode,
    lodNear: state.lodNear,
    lodFar: state.lodFar,
    bordersNearOnly: state.bordersNearOnly,
    renderPath: state.renderPath,
    maxInstances: state.maxInstances,
    meshWorker: state.meshWorker,
    meshWorkerThreads: state.meshWorkerThreads,
    gpuPowerPreference: state.gpuPowerPreference,
    antialias: state.antialias,
    shaderPrecision: state.shaderPrecision,
    skipIdleRender: state.skipIdleRender,
    colorHex: state.colorHex,
    colorHSB: api.getColorHSB(),
    axis: grid.axis,
    slice: grid.slice,
    partId: grid.partId,
    characterHeightBlocks: pawns ? pawns.getHeightBlocks() : null,
    groupRecording: groups.getRecordingId(),
    groupSelected: groups.getSelectedId(),
    groups: groups.list(),
    // selectionCount only — full attrs via getSelectionAttributes() (avoid syncMeta cost).
    selectionCount: selection.size(),
  });

  // Internals for advanced hosts / tests
  api.scene = scene;
  api.camera = cam.camera;
  api.cameraController = cam;
  api.grid = grid;
  api.assetCache = assetCache;
  api.voxelView = voxelView;
  api.three = { THREE, renderer: webgl, controls: cam.controls };
  api.pawns = () => pawns;

  input = new ForgeInput({
    dom: canvas,
    camera: cam.camera,
    grid,
    renderer3d: voxelView,
    cam,
    getState: () => ({
      tool: state.tool,
      brushSize: state.brushSize,
      brushW: state.brushW,
      brushH: state.brushH,
      brushShape: state.brushShape,
      circleRadius: state.circleRadius,
      shapeId: state.shapeId,
      strokeLength: state.strokeLength,
      strokeSmooth: state.strokeSmooth,
      strokeAsGroup: state.strokeAsGroup,
      activeTextureId: state.activeTextureId,
      texScale: state.texScale,
      materialId: state.materialId,
      colorHex: state.colorHex,
      paintDrag: state.paintDrag,
      snapMode: state.snapMode,
      shapeGen: shapeGen.getParams(),
    }),
    api,
  });

  function resize() {
    const w = host.clientWidth || canvas.clientWidth || 800;
    const h = host.clientHeight || canvas.clientHeight || 500;
    webgl.setSize(w, h, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    cam.resize(w, h);
  }

  let raf = 0;
  let running = false;
  let lastFrameAt = 0;
  let lastCamSig = "";
  const _pivotTmp = new THREE.Vector3();
  const clock = new THREE.Clock();

  const stageEl =
    (canvas.parentElement && canvas.parentElement.classList?.contains("forge-stage")
      ? canvas.parentElement
      : host) || document.body;
  const nerd = createNerdOverlay({
    host: stageEl,
    getThree: () => ({ renderer: webgl }),
    startOpen: false,
  });
  api.nerd = nerd;
  nerd.setVisible?.(state.showFpsOverlay);

  // Re-bind overlay visibility now that nerd exists (API may have been called early).
  api.setShowFpsOverlay = (on) => {
    state.showFpsOverlay = !!on;
    nerd.setVisible?.(state.showFpsOverlay);
    bus.emit("perfChange", api.getPerformancePrefs());
    return state.showFpsOverlay;
  };

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Skip GPU work while tab/document is hidden (rAF may still fire lightly).
    if (typeof document !== "undefined" && document.hidden) return;
    if (state.fpsLimit > 0) {
      const minDelta = 1000 / state.fpsLimit;
      if (now - lastFrameAt < minDelta) return;
      lastFrameAt = now;
    }
    const t0 = performance.now();
    const dt = Math.min(0.05, clock.getDelta());
    cam.update(dt);
    axisGizmo?.update?.(dt);
    chunkGen?.update?.(dt);
    if (pawns) pawns.update(dt);

    const pivot = cam.getPivot?.(_pivotTmp) || _pivotTmp.set(0, 0, 0);
    const lodChanged = !!voxelView.tickLod?.(cam.camera, pivot);
    const p = cam.camera.position;
    const camSig = `${p.x.toFixed(3)}|${p.y.toFixed(3)}|${p.z.toFixed(3)}|${pivot.x.toFixed(3)}|${pivot.y.toFixed(3)}|${pivot.z.toFixed(3)}`;
    const camMoved = camSig !== lastCamSig;
    lastCamSig = camSig;
    const needDraw = !!voxelView.needsDraw?.() || !!voxelView.hasPendingMeshWork?.();
    const skipIdle =
      state.skipIdleRender &&
      !forceNextRender &&
      !camMoved &&
      !lodChanged &&
      !needDraw;
    if (!skipIdle) {
      webgl.render(scene, cam.camera);
      forceNextRender = false;
      voxelView.clearNeedsDraw?.();
    }
    nerd.tick(performance.now() - t0);
  }

  api.start = () => {
    if (running) return;
    running = true;
    clock.start();
    lastFrameAt = 0;
    lastCamSig = "";
    forceNextRender = true;
    resize();
    raf = requestAnimationFrame(frame);
  };

  api.stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  api.dispose = () => {
    api.stop();
    if (emitTimer) clearTimeout(emitTimer);
    chunkGen?.dispose?.();
    chunkGen = null;
    lightCtl.dispose();
    input.dispose();
    nerd.dispose();
    axisGizmo?.dispose?.();
    if (pawns) {
      pawns.dispose();
      pawns = null;
    }
    voxelView.dispose();
    cam.dispose(scene);
    webgl.dispose();
    bus.clear();
    window.removeEventListener("resize", resize);
  };

  window.addEventListener("resize", resize);
  resize();
  // Part/asset forge: start framed on origin with floor grid + slice helper visible.
  if (grid.mode === "part") {
    api.frameWorkspace({ ensureGrid: true, ensureSliceHelper: true });
  }
  if (options.autostart !== false) api.start();

  return api;
}

