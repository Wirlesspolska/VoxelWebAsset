/**
 * Optional thin HUD binder — host pages own markup; this only syncs controls ↔ API.
 * Binds File navbar, preferences, palettes, groups, and project / asset IO.
 */

import {
  isVxw,
  parseVxw,
  serializeVxw,
  normalizeWorldBounds,
  DEFAULT_Z_MIN,
  isVxt,
  applyVxt,
  isVxb,
  serializeVxb,
  parseVxb,
  shouldPreferBinary,
} from "../io/index.js";
import {
  createProject,
  isProject,
  parseProject,
  serializeProject,
  rememberRecent,
  listRecentFiltered,
  downloadJSON,
  downloadBlob,
  assetPathOrKey,
  assetDownloadFilename,
  isAssetsPath,
  saveDraft,
  loadDraft,
  usesVxw,
  touchProject,
  PROJECT_TYPES,
} from "../project/index.js";
import { normalizeVolume } from "../core/serialize.js";
import { formatControlsHelpSegments } from "../input/bindingsHelp.js";
import { bindNavbar } from "./navbar.js";
import { loadPrefs, savePrefs, normalizePrefs } from "./prefs.js";
import { MATERIAL_PRESETS } from "../materials/palettes.js";
import { bindForgePanel } from "./bindForgePanel.js";
import { bindColorPicker } from "./colorPicker.js";
import { mountLeftDock, applyDockSide } from "./leftDock.js";
import { bindToolsNavbar } from "./toolsNavbar.js";
import { createPanelPopoutManager } from "./panelPopout.js";
import { mountUtilityLayer, buildUtilityPanels } from "./utilityLayer.js";

export function bindForgeHud(voxie, root = document) {
  const $ = (sel) => root.querySelector(sel);

  let prefs = loadPrefs();
  /** @type {ReturnType<typeof mountLeftDock>|null} */
  let dockRef = null;
  /** @type {ReturnType<typeof mountUtilityLayer>|null} */
  let utilitiesRef = null;

  const utilityPanels = buildUtilityPanels();

  const popouts = createPanelPopoutManager({
    root,
    getPanelRoot: (id) =>
      dockRef?.getPanelRoot?.(id) ||
      utilitiesRef?.getPanelRoot?.(id) ||
      root.querySelector(`[data-voxie-panel="${id}"]`),
    stylesheetHref: "css/voxel-forge.css",
  });

  // Slim dock (Color + tool) + navbar utilities (Project / Volume / Perf / Controls).
  const modeHint = voxie.getState?.()?.mode === "world" ? "world" : "part";
  const dock = mountLeftDock(root, voxie, {
    mode: modeHint,
    dockSide: prefs.dockSide || "left",
    activePanel: voxie.getTool?.() || "place",
    popoutManager: popouts,
  });
  dockRef = dock;

  const utilities = mountUtilityLayer(root, voxie, {
    panels: utilityPanels,
    syncMeta: () => syncMeta(),
  });
  utilitiesRef = utilities;

  /** @type {ReturnType<typeof bindToolsNavbar>|null} */
  let toolsNav = null;

  const toolBtns = root.querySelectorAll("[data-voxie-tool]");
  const layerBtns = root.querySelectorAll("[data-voxie-layer]");
  const hue = $("[data-voxie-hue]");
  const sat = $("[data-voxie-sat]");
  const bri = $("[data-voxie-bri]");
  const swatch = $("[data-voxie-swatch]");
  // Color picker already bound inside colorPickerPanel; keep handle for syncColorUI.
  const colorPicker = dock.getPanel("color") || null;
  const border = $("[data-voxie-border]");
  const brush = $("[data-voxie-brush]");
  const isolate = $("[data-voxie-isolate]");
  const gridToggle = $("[data-voxie-grid]");
  const moveSpeedInput = $("[data-voxie-move-speed]");
  const moveGridSnap = $("[data-voxie-move-grid-snap]");
  const noiseTint = $("[data-voxie-noise-tint]");
  const paintDrag = $("[data-voxie-paint-drag]");
  const paletteHost = $("[data-voxie-palette]");
  const exportBtn = $("[data-voxie-export]");
  const exportJsonBtn = $("[data-voxie-export-json]");
  const exportVxbBtn = $("[data-voxie-export-vxb]");
  const exportScaleSel = $("[data-voxie-export-scale]");
  const importBtn = $("[data-voxie-import]");
  const importFile = $("[data-voxie-import-file]");
  const clearBtn = $("[data-voxie-clear]");
  const controlsHelpEl = $("[data-voxie-controls-help]");

  // Project / asset UX
  const projectNewBtn = $("[data-voxie-project-new]");
  const projectTypeSel = $("[data-voxie-project-type]");
  const projectOpenBtn = $("[data-voxie-project-open]");
  const projectOpenFile = $("[data-voxie-project-open-file]");
  const projectSaveBtn = $("[data-voxie-project-save]");
  const projectSaveProjBtn = $("[data-voxie-project-save-json]");
  const projectRecentSel = $("[data-voxie-project-recent]");
  const projectNameInput = $("[data-voxie-project-name-input]");
  const zMinInput = $("[data-voxie-zmin]");
  const zMaxInput = $("[data-voxie-zmax]");
  const waterInput = $("[data-voxie-water-level]");
  const boundsSection = $("[data-voxie-world-bounds]");

  // Groups
  const groupStartBtn = $("[data-voxie-group-start]");
  const groupStopBtn = $("[data-voxie-group-stop]");
  const groupRecolorBtn = $("[data-voxie-group-recolor]");
  const groupGradientBtn = $("[data-voxie-group-gradient]");
  const groupShadeBtn = $("[data-voxie-group-shade]");
  const groupTextureBtn = $("[data-voxie-group-texture]");
  const groupFromSelBtn = $("[data-voxie-group-from-sel]");
  const groupByColorBtn = $("[data-voxie-group-by-color]");
  const groupApplyChBtn = $("[data-voxie-group-apply-channels]");
  const groupListEl = $("[data-voxie-group-list]");
  const groupStatusEl = $("[data-voxie-group-status]");

  // Preferences modal
  const prefsModal = $("[data-voxie-prefs-modal]");
  const prefsClose = $("[data-voxie-prefs-close]");
  const prefsApply = $("[data-voxie-prefs-apply]");
  const prefsZMin = $("[data-prefs-zmin]");
  const prefsZMax = $("[data-prefs-zmax]");
  const prefsWater = $("[data-prefs-water]");
  const prefsBorders = $("[data-prefs-borders]");
  const prefsGrid = $("[data-prefs-grid]");
  const prefsNoise = $("[data-prefs-noise]");
  const prefsLayer = $("[data-prefs-layer]");
  const prefsBrush = $("[data-prefs-brush]");
  const prefsNoiseAmt = $("[data-prefs-noise-amt]");
  const prefsNoiseAmtVal = $("[data-prefs-noise-amt-val]");
  const prefsPotato = $("[data-prefs-potato]");
  const prefsAutoExpand = $("[data-prefs-auto-expand]");
  const prefsShowAxes = $("[data-prefs-show-axes]");
  const prefsSizeX = $("[data-prefs-size-x]");
  const prefsSizeY = $("[data-prefs-size-y]");
  const prefsSizeZ = $("[data-prefs-size-z]");
  const prefsMoveSpeed = $("[data-prefs-move-speed]");
  const prefsMoveGridSnap = $("[data-prefs-move-grid-snap]");

  /** @type {ReturnType<typeof bindNavbar>|null} */
  let navbar = null;

  const defaultType =
    (projectTypeSel?.value && PROJECT_TYPES.includes(projectTypeSel.value)
      ? projectTypeSel.value
      : null) ||
    (voxie.getState?.()?.mode === "world" ? "world" : "part");

  let project = createProject({
    type: defaultType,
    name: defaultType === "world" ? "untitled_world" : "untitled_part",
    worldBounds: readBoundsFromVolumeMeta() || {
      zMin: prefs.zMin,
      ...(prefs.zMax != null ? { zMax: prefs.zMax } : {}),
      ...(prefs.waterLevel != null ? { waterLevel: prefs.waterLevel } : {}),
    },
  });

  function readBoundsFromVolumeMeta() {
    try {
      const meta = voxie.exportVolume?.()?.meta;
      if (meta?.worldBounds) return normalizeWorldBounds(meta.worldBounds);
    } catch {
      /* ignore */
    }
    return null;
  }

  function syncColorUI() {
    const { h, s, b } = voxie.getColorHSB();
    if (hue) hue.value = String(h);
    if (sat) sat.value = String(s);
    if (bri) bri.value = String(b);
    if (swatch) swatch.style.background = voxie.getColorHex();
    colorPicker?.sync?.(voxie);
    dock.sync?.();
    syncPaletteActive();
  }

  function syncPaletteActive() {
    if (!paletteHost) return;
    const mid = voxie.getMaterialId?.() || "";
    paletteHost.querySelectorAll("[data-material-id]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.materialId === mid);
    });
  }

  function syncControlsHelp() {
    if (!controlsHelpEl) return;
    controlsHelpEl.replaceChildren();
    const tool = voxie.getTool?.() || "";
    for (const seg of formatControlsHelpSegments({ tool })) {
      const wrap = document.createElement("span");
      wrap.className = "bind-seg";
      const keys = document.createElement("span");
      keys.className = "bind-keys";
      keys.textContent = seg.keys;
      wrap.append(keys, document.createTextNode(` ${seg.action}`));
      controlsHelpEl.appendChild(wrap);
    }
  }

  function readExportScale() {
    const n = Number(exportScaleSel?.value);
    return n === 2 || n === 4 ? n : 1;
  }

  function syncMeta() {
    const st = voxie.getState();
    const toolLabel = st.tool === "none" ? "deselect" : st.tool;
    for (const el of root.querySelectorAll("[data-voxie-axis]")) {
      el.textContent = st.axis.toUpperCase();
    }
    for (const el of root.querySelectorAll("[data-voxie-slice]")) {
      el.textContent = String(st.slice);
    }
    for (const el of root.querySelectorAll("[data-voxie-tool-label]")) {
      el.textContent = toolLabel;
    }
    for (const el of root.querySelectorAll("[data-voxie-build-mode]")) {
      el.textContent = st.mode;
    }
    const ws = voxie.getWorldSize?.() || st.worldSize;
    const sizeLabel =
      ws && Number.isFinite(ws.x)
        ? `${ws.x|0}×${ws.y|0}×${ws.z|0}`
        : "—";
    for (const el of root.querySelectorAll("[data-voxie-world-size]")) {
      el.textContent = sizeLabel;
    }
    for (const el of root.querySelectorAll("[data-voxie-mode]")) {
      el.textContent = st.mode;
    }
    utilities?.sync?.();
    for (const btn of toolBtns) {
      btn.classList.toggle("is-active", btn.dataset.voxieTool === st.tool);
    }
    for (const btn of layerBtns) {
      btn.classList.toggle("is-active", btn.dataset.voxieLayer === st.layerMode);
    }
    if (border) border.checked = st.borders;
    if (brush) brush.value = String(st.brushSize);
    if (isolate) isolate.checked = st.isolatePart;
    if (gridToggle) gridToggle.checked = st.showGrid !== false;
    if (noiseTint) noiseTint.checked = st.noiseTint === true;
    navbar?.setModeBadge(st.mode, project.type);
  }

  function syncGroupsUI() {
    const st = voxie.getState();
    const list = st.groups || [];
    const recording = st.groupRecording;
    const selected = st.groupSelected;
    if (groupStopBtn) groupStopBtn.disabled = !recording;
    if (groupStartBtn) groupStartBtn.disabled = !!recording;
    if (groupStatusEl) {
      if (recording) {
        const g = list.find((x) => x.id === recording);
        groupStatusEl.textContent = `Recording: ${g?.name || recording}`;
      } else if (selected) {
        const g = list.find((x) => x.id === selected);
        groupStatusEl.textContent = `Selected: ${g?.name || selected} (${g?.count ?? 0})`;
      } else {
        groupStatusEl.textContent = list.length ? "Select a group" : "No active group";
      }
    }
    if (!groupListEl) return;
    groupListEl.innerHTML = "";
    for (const g of list) {
      const li = document.createElement("li");
      if (g.selected) li.classList.add("is-selected");
      if (g.recording) li.classList.add("is-recording");
      li.dataset.groupId = g.id;
      const dot = document.createElement("span");
      dot.className = "group-dot";
      dot.style.background = g.color;
      const name = document.createElement("span");
      name.textContent = g.name;
      const meta = document.createElement("span");
      meta.className = "group-meta";
      meta.textContent = `${g.count}${g.recording ? " · rec" : ""}`;
      li.append(dot, name, meta);
      li.addEventListener("click", (ev) => {
        voxie.selectGroup(g.id, { additive: !!ev.shiftKey });
        syncGroupsUI();
        syncColorUI();
      });
      groupListEl.appendChild(li);
    }
  }

  function syncProjectUI() {
    const showBounds = usesVxw(project.type);
    if (boundsSection) boundsSection.hidden = !showBounds;
    if (projectTypeSel) projectTypeSel.value = project.type;
    if (projectNameInput) projectNameInput.value = project.name;
    for (const el of root.querySelectorAll("[data-voxie-project-name]")) {
      el.textContent = project.name;
    }
    for (const el of root.querySelectorAll("[data-voxie-project-type-label]")) {
      el.textContent = project.type;
    }
    const b = normalizeWorldBounds(project.worldBounds);
    if (zMinInput) zMinInput.value = String(b.zMin);
    if (zMaxInput) zMaxInput.value = b.zMax != null ? String(b.zMax) : "";
    if (waterInput) waterInput.value = b.waterLevel != null ? String(b.waterLevel) : "";
    refreshRecentDropdown();
    const mode = usesVxw(project.type) ? "world" : "part";
    navbar?.setModeBadge(voxie.getState?.()?.mode || mode, project.type);
    for (const el of root.querySelectorAll("[data-voxie-build-mode]")) {
      el.textContent = voxie.getState?.()?.mode || mode;
    }
  }

  function refreshRecentDropdown() {
    if (!projectRecentSel) return;
    const recent = listRecentFiltered({ preferAssets: true });
    const cur = projectRecentSel.value;
    projectRecentSel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = recent.length ? "Recent… (assets/ first)" : "No recent files";
    projectRecentSel.appendChild(ph);
    recent.forEach((r, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      const tag = isAssetsPath(r.pathOrKey) ? "assets" : "other";
      const pathHint = r.pathOrKey ? ` · ${r.pathOrKey}` : "";
      opt.textContent = `[${tag}] ${r.name} (${r.type}/${r.kind})${pathHint}`;
      projectRecentSel.appendChild(opt);
    });
    if (cur) projectRecentSel.value = cur;
    navbar?.refreshRecent?.();
  }

  let draftTimer = 0;
  function persistDraftSoon() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      draftTimer = 0;
      try {
        project = touchProject(project, {
          name: projectNameInput?.value?.trim() || project.name,
          type: projectTypeSel?.value || project.type,
          worldBounds: readBoundsFromUI(),
        });
        if (usesVxw(project.type)) writeBoundsToVolumeMeta(project.worldBounds);
        saveDraft({ project, volume: voxie.exportVolume() });
      } catch (err) {
        console.warn("[Voxie3D] draft autosave failed", err);
      }
    }, 600);
  }

  function rememberAsset(entry) {
    const type = entry.type || project.type;
    const kind = entry.kind || (usesVxw(type) ? "vxw" : "json");
    const pathOrKey =
      entry.pathOrKey ||
      assetPathOrKey({
        type,
        name: entry.name || project.name,
        kind,
        ext: entry.ext,
      });
    rememberRecent({
      name: entry.name || project.name,
      type,
      kind,
      pathOrKey,
    });
  }

  function writeBoundsToVolumeMeta(bounds) {
    const worldBounds = normalizeWorldBounds(bounds);
    const grid = voxie.grid;
    if (grid?.setMeta) {
      grid.setMeta({
        ...(grid.meta || {}),
        worldBounds,
        ...(usesVxw(project.type) ? { vxwKind: project.type } : {}),
      });
      return;
    }
    const vol = voxie.exportVolume();
    voxie.importVolume({
      ...vol,
      meta: {
        ...(vol.meta || {}),
        worldBounds,
        ...(usesVxw(project.type) ? { vxwKind: project.type } : {}),
      },
    });
  }

  function readBoundsFromUI() {
    const raw = {
      zMin: zMinInput?.value !== "" && zMinInput != null ? Number(zMinInput.value) : DEFAULT_Z_MIN,
    };
    if (zMaxInput?.value !== "" && zMaxInput?.value != null) {
      const n = Number(zMaxInput.value);
      if (Number.isFinite(n)) raw.zMax = n;
    }
    if (waterInput?.value !== "" && waterInput?.value != null) {
      const n = Number(waterInput.value);
      if (Number.isFinite(n)) raw.waterLevel = n;
    }
    return normalizeWorldBounds(raw);
  }

  function applyBoundsFromUI() {
    const bounds = readBoundsFromUI();
    project = touchProject(project, { worldBounds: bounds });
    if (usesVxw(project.type)) writeBoundsToVolumeMeta(bounds);
    syncProjectUI();
  }

  function focusUtilityPanel(id) {
    utilities.open?.(id);
  }

  function applyPrefsToEditor(p = prefs) {
    const next = normalizePrefs(p);
    voxie.applyPerformancePrefs?.(next);
    voxie.setPotatoMode?.(next.potatoMode);
    // Borders stay independently controllable in Potato (prefs may default Off on enable).
    voxie.setBorder?.(next.borders);
    voxie.setNoiseTint?.(next.potatoMode ? false : next.noiseTint);
    voxie.setBrushSize?.(next.brushSize);
    voxie.setLayerMode?.(next.layerMode);
    voxie.setGridVisible?.(next.showGrid);
    voxie.setNoiseAmount?.(next.noiseAmount);
    voxie.setAutoExpand?.(next.autoExpand);
    // Axis arrows: world-only preference. Part/asset sculpt keeps them hidden.
    const worldMode = voxie.getState?.()?.mode === "world";
    const axesOn = worldMode && next.showAxisGizmo === true;
    voxie.setAxisGizmoVisible?.(axesOn);
    voxie.setCamMoveSpeed?.(next.moveSpeed);
    voxie.setCamKeyboardGridSnap?.(next.keyboardGridSnap);
    navbar?.setAxisGizmoLabel?.(axesOn);
    if (border) border.checked = !!next.borders;
    if (brush) brush.value = String(next.brushSize);
    if (gridToggle) gridToggle.checked = next.showGrid;
    if (moveSpeedInput) moveSpeedInput.value = String(next.moveSpeed);
    if (moveGridSnap) moveGridSnap.checked = !!next.keyboardGridSnap;
    if (noiseTint) noiseTint.checked = next.potatoMode ? false : next.noiseTint;
    syncMeta();
  }

  /**
   * Create a fresh document in the given project type / build mode.
   * @param {'part'|'world'|'terrain'|'map'} type
   * @param {{ askName?: boolean, seedTerrain?: boolean }} [opts]
   */
  function createNewDocument(type, opts = {}) {
    const askName = opts.askName !== false;
    const t = PROJECT_TYPES.includes(type) ? type : "part";
    let name = `untitled_${t}`;
    if (askName) {
      const entered = prompt("Project name", name);
      if (entered == null) return false;
      name = entered.trim() || name;
    }
    const bounds = normalizeWorldBounds({
      zMin: prefs.zMin,
      ...(prefs.zMax != null ? { zMax: prefs.zMax } : {}),
      ...(prefs.waterLevel != null ? { waterLevel: prefs.waterLevel } : {}),
      ...readBoundsFromUI(),
    });
    project = createProject({ type: t, name, worldBounds: bounds });
    const worldMode = usesVxw(t);
    // Empty docs start small around origin (0,0,0); grow via auto-expand / prefs sizes.
    const sx = prefs.sizeX || prefs.startSize || 8;
    const sy = prefs.sizeY || prefs.startSize || 8;
    const sz = prefs.sizeZ || prefs.startSize || 8;
    const worldSize =
      worldMode && opts.seedTerrain !== false && t !== "map"
        ? { x: 32, y: 32, z: 32 }
        : { x: sx, y: sy, z: sz };
    const empty = {
      mode: worldMode ? "world" : "part",
      size: worldSize.x,
      worldSize,
      axis: "z",
      slice: 0,
      voxels: [],
      groups: [],
      meta: worldMode
        ? { vxwKind: t, worldBounds: normalizeWorldBounds(bounds) }
        : undefined,
    };
    voxie.importVolume(empty);
    voxie.setBuildMode?.(worldMode ? "world" : "part");
    voxie.setWorldSize?.(worldSize);
    voxie.setSlice?.(0);
    // Part/asset create: force-hide axis arrows (sculpting does not need them).
    // World: restore optional Axes pref / toggle.
    if (!worldMode) {
      voxie.setAxisGizmoVisible?.(false);
      navbar?.setAxisGizmoLabel?.(false);
      // New asset/part: floor grid + slice helper on, camera framed above origin.
      voxie.setGridVisible?.(true);
      if (gridToggle) gridToggle.checked = true;
      prefs = savePrefs({ ...loadPrefs(), showGrid: true });
      voxie.frameWorkspace?.({ ensureGrid: true, ensureSliceHelper: true });
    } else {
      const axesOn = prefs.showAxisGizmo === true;
      voxie.setAxisGizmoVisible?.(axesOn);
      navbar?.setAxisGizmoLabel?.(axesOn);
    }
    if (worldMode && opts.seedTerrain !== false && t !== "map") {
      try {
        voxie.setWorldSize?.({ x: 32, y: 32, z: 32 });
        voxie.generateTerrain?.();
      } catch (err) {
        console.warn("[Voxie3D] terrain seed skipped", err);
      }
    }
    // Empty world (map / no seed): still frame the volume so the ground grid reads.
    if (worldMode && (opts.seedTerrain === false || t === "map")) {
      voxie.frameWorkspace?.({ ensureGrid: true, ensureSliceHelper: true });
      if (gridToggle) gridToggle.checked = true;
    }
    rememberAsset({
      name: project.name,
      type: project.type,
      kind: worldMode ? "vxw" : "json",
    });
    persistDraftSoon();
    syncMeta();
    syncColorUI();
    syncProjectUI();
    syncGroupsUI();
    return true;
  }

  // --- Palette chips ---
  if (paletteHost) {
    paletteHost.innerHTML = "";
    for (const mat of MATERIAL_PRESETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "palette-swatch";
      btn.title = `${mat.name} (${mat.color})`;
      btn.dataset.materialId = mat.id;
      btn.style.background = mat.color;
      btn.addEventListener("click", () => {
        voxie.setMaterialId(mat.id);
        syncColorUI();
      });
      paletteHost.appendChild(btn);
    }
  }

  for (const btn of toolBtns) {
    btn.addEventListener("click", () => {
      voxie.setTool(btn.dataset.voxieTool);
      syncMeta();
    });
  }
  for (const btn of layerBtns) {
    btn.addEventListener("click", () => {
      voxie.setLayerMode(btn.dataset.voxieLayer);
      syncMeta();
    });
  }

  const onHSB = () => {
    voxie.setColorHSB(Number(hue?.value || 0), Number(sat?.value || 0), Number(bri?.value || 0));
    // Manual HSB edits clear material preset selection
    voxie.setMaterialId?.(null);
    syncColorUI();
  };
  hue?.addEventListener("input", onHSB);
  sat?.addEventListener("input", onHSB);
  bri?.addEventListener("input", onHSB);

  border?.addEventListener("change", () => {
    voxie.setBorder(border.checked);
    syncMeta();
  });
  brush?.addEventListener("change", () => {
    voxie.setBrushSize(Number(brush.value));
    syncMeta();
  });
  isolate?.addEventListener("change", () => {
    voxie.setIsolatePart(isolate.checked);
    syncMeta();
  });
  gridToggle?.addEventListener("change", () => {
    voxie.setGridVisible?.(gridToggle.checked);
    syncMeta();
  });
  const persistCamMovePrefs = () => {
    prefs = savePrefs({
      ...loadPrefs(),
      moveSpeed: Number(moveSpeedInput?.value) || prefs.moveSpeed || 10,
      keyboardGridSnap: !!moveGridSnap?.checked,
    });
  };
  moveSpeedInput?.addEventListener("change", () => {
    const speed = Number(moveSpeedInput.value) || 10;
    voxie.setCamMoveSpeed?.(speed);
    persistCamMovePrefs();
  });
  moveGridSnap?.addEventListener("change", () => {
    voxie.setCamKeyboardGridSnap?.(moveGridSnap.checked);
    persistCamMovePrefs();
  });
  noiseTint?.addEventListener("change", () => {
    voxie.setNoiseTint?.(noiseTint.checked);
    syncMeta();
  });
  paintDrag?.addEventListener("change", () => {
    voxie.setPaintDrag?.(paintDrag.checked);
  });
  if (paintDrag) paintDrag.checked = !!voxie.getPaintDrag?.();

  // Groups
  groupStartBtn?.addEventListener("click", () => {
    voxie.startGroup({ color: voxie.getColorHex() });
    syncGroupsUI();
  });
  groupStopBtn?.addEventListener("click", () => {
    voxie.stopGroup();
    syncGroupsUI();
  });
  groupRecolorBtn?.addEventListener("click", () => {
    const id = voxie.getState().groupSelected;
    if (!id) {
      alert("Select a group first.");
      return;
    }
    voxie.recolorGroup(id, voxie.getColorHex());
    syncGroupsUI();
    syncColorUI();
  });
  groupGradientBtn?.addEventListener("click", () => {
    const id = voxie.getState().groupSelected;
    if (!id) {
      alert("Select a group first.");
      return;
    }
    const end = voxie.getColorHex();
    voxie.applyGroupGradient(id, "y", "#2a2218", end);
    syncGroupsUI();
  });
  groupShadeBtn?.addEventListener("click", () => {
    const id = voxie.getState().groupSelected;
    if (!id) {
      alert("Select a group first.");
      return;
    }
    voxie.applyGroupShade(id, "y", 0.35);
    syncGroupsUI();
  });
  groupTextureBtn?.addEventListener("click", () => {
    const id = voxie.getState().groupSelected;
    if (!id) {
      alert("Select a group first.");
      return;
    }
    const n = voxie.applyTexturizerToGroup?.(id);
    if (!n) alert("Generate / pick a texture in Textures first.");
    syncGroupsUI();
  });
  groupFromSelBtn?.addEventListener("click", () => {
    const g = voxie.groupFromSelection?.({ color: voxie.getColorHex() });
    if (!g) alert("Select voxels first (Shift+click / box).");
    syncGroupsUI();
  });
  groupByColorBtn?.addEventListener("click", () => {
    const tol = Number($("[data-voxie-group-color-tol]")?.value || 0);
    const selOnly = (voxie.selection?.size?.() || 0) > 0;
    const created = voxie.groupByColor?.({
      tolerance: tol,
      selectionOnly: selOnly,
    });
    if (!created?.length) alert("No voxels to group by color.");
    syncGroupsUI();
  });
  groupApplyChBtn?.addEventListener("click", () => {
    const adj = {
      hue: Number($("[data-voxie-group-hue]")?.value || 0),
      saturation: Number($("[data-voxie-group-sat]")?.value || 0),
      brightness: Number($("[data-voxie-group-bri]")?.value || 0),
      r: Number($("[data-voxie-group-ch-r]")?.value || 0),
      g: Number($("[data-voxie-group-ch-g]")?.value || 0),
      b: Number($("[data-voxie-group-ch-b]")?.value || 0),
      variety: !!$("[data-voxie-group-variety]")?.checked,
    };
    const n = voxie.applyGroupChannels?.(adj);
    if (!n) alert("Select a group first.");
    syncGroupsUI();
  });

  function bendTimeSession() {
    const base = projectNameInput?.value?.trim() || project.name || "untitled";
    const suggested = / \(branch\)$/i.test(base) ? base : `${base} (branch)`;
    const entered = prompt("Bend time — new session name", suggested);
    if (entered == null) return false;
    const name = entered.trim() || suggested;
    const vol = voxie.exportVolume();
    project = createProject({
      type: project.type,
      name,
      worldBounds: project.worldBounds,
      assets: project.assets,
    });
    // Keep current voxels as the branch point; clear undo
    voxie.importVolume(vol);
    voxie.clearHistory?.();
    rememberAsset({
      name: project.name,
      type: project.type,
      kind: usesVxw(project.type) ? "vxw" : "json",
    });
    persistDraftSoon();
    syncMeta();
    syncProjectUI();
    syncGroupsUI();
    return true;
  }

  function setDockSide(side) {
    const next = applyDockSide(root, side === "right" ? "right" : "left");
    prefs = savePrefs({ ...prefs, dockSide: next });
    dock.setDockSide?.(next);
    return next;
  }

  function selectToolNav(item) {
    if (item.tool) {
      voxie.setTool?.(item.tool);
    }
    if (item.panel) {
      dock.setActivePanel?.(item.panel);
    }
    syncMeta();
    toolsNav?.sync?.();
  }

  // History strip / panel buttons (may exist in multiple places)
  root.querySelectorAll("[data-voxie-undo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      voxie.undo?.();
      syncMeta();
    });
  });
  root.querySelectorAll("[data-voxie-redo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      voxie.redo?.();
      syncMeta();
    });
  });
  root.querySelectorAll("[data-voxie-bend-time]").forEach((btn) => {
    btn.addEventListener("click", () => bendTimeSession());
  });
  root.addEventListener("voxie-bend-time", () => bendTimeSession());

  function exportVolumeJson() {
    const vol = voxie.exportVolume();
    const st = voxie.getState();
    const tag = st.mode === "world" ? "world" : st.partId || "part";
    downloadJSON(`${tag}.voxie.json`, vol);
  }

  function exportVolumeBinary() {
    const vol = voxie.exportVolume();
    const buf = serializeVxb(vol, { scale: readExportScale() });
    const st = voxie.getState();
    const tag = st.mode === "world" ? "world" : st.partId || "part";
    downloadBlob(`${tag}.vxb`, new Blob([buf], { type: "application/octet-stream" }));
  }

  /** Prefer binary when large; JSON for small/readable. */
  function exportVolumeSmart() {
    const vol = voxie.exportVolume();
    if (shouldPreferBinary(vol)) exportVolumeBinary();
    else exportVolumeJson();
  }

  exportBtn?.addEventListener("click", () => exportVolumeSmart());
  exportJsonBtn?.addEventListener("click", () => exportVolumeJson());
  exportVxbBtn?.addEventListener("click", () => exportVolumeBinary());

  importBtn?.addEventListener("click", () => importFile?.click());
  importFile?.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      await openAssetFile(file);
    } catch (err) {
      console.error("[Voxie3D] import failed", err);
      alert("Import failed — invalid volume / .vxb / asset file.");
    }
    importFile.value = "";
  });

  clearBtn?.addEventListener("click", () => {
    if (confirm("Clear all voxels?")) {
      voxie.clear();
      syncGroupsUI();
    }
  });

  // --- Project UX ---

  projectNameInput?.addEventListener("change", () => {
    const name = projectNameInput.value.trim() || project.name;
    project = touchProject(project, { name });
    syncProjectUI();
  });

  projectTypeSel?.addEventListener("change", () => {
    const type = projectTypeSel.value;
    project = touchProject(project, { type });
    const worldMode = usesVxw(type);
    voxie.setBuildMode?.(worldMode ? "world" : "part");
    if (worldMode) writeBoundsToVolumeMeta(readBoundsFromUI());
    syncProjectUI();
    syncMeta();
  });

  zMinInput?.addEventListener("change", applyBoundsFromUI);
  zMaxInput?.addEventListener("change", applyBoundsFromUI);
  waterInput?.addEventListener("change", applyBoundsFromUI);

  projectNewBtn?.addEventListener("click", () => {
    const type = projectTypeSel?.value || project.type || "part";
    createNewDocument(type);
  });

  projectOpenBtn?.addEventListener("click", () => projectOpenFile?.click());
  projectOpenFile?.addEventListener("change", async () => {
    const file = projectOpenFile.files?.[0];
    if (!file) return;
    try {
      await openAssetFile(file);
    } catch (err) {
      console.error("[Voxie3D] open failed", err);
      alert("Open failed — expected .vxw / .vxb / .vxt / .json (volume or project).");
    }
    projectOpenFile.value = "";
  });

  projectSaveBtn?.addEventListener("click", () => {
    try {
      savePrimaryAsset();
    } catch (err) {
      console.error("[Voxie3D] save failed", err);
      alert("Save failed.");
    }
  });

  projectSaveProjBtn?.addEventListener("click", () => {
    project = touchProject(project, { worldBounds: readBoundsFromUI() });
    const doc = serializeProject(project);
    const pathOrKey = assetPathOrKey({
      type: project.type,
      name: project.name,
      kind: "json",
      ext: "vxpj.json",
    });
    downloadJSON(
      assetDownloadFilename({
        type: project.type,
        name: project.name,
        kind: "json",
        ext: "vxpj.json",
      }),
      doc
    );
    rememberAsset({
      name: project.name,
      type: project.type,
      kind: "json",
      pathOrKey,
      ext: "vxpj.json",
    });
    persistDraftSoon();
    refreshRecentDropdown();
  });

  projectRecentSel?.addEventListener("change", () => {
    const idx = Number(projectRecentSel.value);
    if (!Number.isFinite(idx)) return;
    restoreRecent(idx);
    projectRecentSel.value = "";
  });

  function restoreRecent(idx) {
    const recent = listRecentFiltered({ preferAssets: true })[idx];
    if (!recent) return;
    project = createProject({
      type: recent.type,
      name: recent.name,
      worldBounds: project.worldBounds,
    });
    const worldMode = usesVxw(recent.type);
    voxie.setBuildMode?.(worldMode ? "world" : "part");
    syncProjectUI();
    syncMeta();
    const where =
      recent.pathOrKey ||
      assetPathOrKey({
        type: recent.type,
        name: recent.name,
        kind: recent.kind,
      });
    alert(
      `Restored recent “${recent.name}” (${recent.type}).\nSuggested path: ${where}\n\nOpen… to reload voxels from disk, or keep sculpting — draft autosave keeps draw progress in this browser.`
    );
  }

  /**
   * Open a user-picked file: VXB binary / VXW / VXT / VXPJ / raw volume JSON.
   * @param {File} file
   */
  async function openAssetFile(file) {
    const lower = (file.name || "").toLowerCase();
    const buf = await file.arrayBuffer();

    if (isVxb(buf) || lower.endsWith(".vxb")) {
      const vol = normalizeVolume(parseVxb(buf));
      voxie.importVolume(vol);
      const type =
        vol.mode === "world" || usesVxw(project.type) ? project.type || "world" : "part";
      const worldType = vol.mode === "world" ? (usesVxw(type) ? type : "world") : "part";
      const name = file.name.replace(/\.[^.]+$/, "") || `untitled_${worldType}`;
      const pathOrKey = isAssetsPath(file.name)
        ? file.name.replace(/\\/g, "/")
        : assetPathOrKey({ type: worldType, name, kind: "vxb" });
      project = createProject({
        type: worldType,
        name,
        worldBounds: readBoundsFromUI(),
        assets: [{ id: "main", kind: "vxb", pathOrKey }],
      });
      voxie.setBuildMode?.(usesVxw(worldType) ? "world" : "part");
      rememberAsset({
        name: project.name,
        type: project.type,
        kind: "vxb",
        pathOrKey,
      });
      persistDraftSoon();
      syncMeta();
      syncColorUI();
      syncProjectUI();
      syncGroupsUI();
      return;
    }

    let text;
    try {
      text = new TextDecoder().decode(buf);
    } catch {
      throw new Error("Invalid file");
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON");
    }

    if (isVxw(data) || lower.endsWith(".vxw")) {
      const loaded = parseVxw(data);
      voxie.importVolume(loaded.volume);
      voxie.setBuildMode?.("world");
      const name = loaded.name || file.name.replace(/\.[^.]+$/, "") || "world";
      const pathOrKey = isAssetsPath(file.name)
        ? file.name.replace(/\\/g, "/")
        : assetPathOrKey({ type: loaded.kind, name, kind: "vxw" });
      project = createProject({
        type: loaded.kind,
        name,
        worldBounds: loaded.bounds,
        assets: [{ id: "main", kind: "vxw", pathOrKey }],
      });
      rememberAsset({
        name: project.name,
        type: project.type,
        kind: "vxw",
        pathOrKey,
      });
      persistDraftSoon();
      syncMeta();
      syncColorUI();
      syncProjectUI();
      syncGroupsUI();
      return;
    }

    if (isVxt(data) || lower.endsWith(".vxt")) {
      applyVxt(voxie, data);
      const pathOrKey = isAssetsPath(file.name)
        ? file.name.replace(/\\/g, "/")
        : assetPathOrKey({
            type: project.type,
            name: file.name.replace(/\.[^.]+$/, ""),
            kind: "vxt",
          });
      project = touchProject(project, {
        assets: [
          ...project.assets.filter((a) => a.kind !== "vxt"),
          { id: "mat", kind: "vxt", pathOrKey },
        ],
      });
      rememberAsset({
        name: file.name.replace(/\.[^.]+$/, "") || file.name,
        type: project.type,
        kind: "vxt",
        pathOrKey,
      });
      persistDraftSoon();
      syncColorUI();
      syncProjectUI();
      return;
    }

    if (isProject(data) || lower.includes("vxpj") || data?.magic === "VXPJ1") {
      project = parseProject(data);
      const pathOrKey = isAssetsPath(file.name)
        ? file.name.replace(/\\/g, "/")
        : assetPathOrKey({
            type: project.type,
            name: project.name,
            kind: "json",
            ext: "vxpj.json",
          });
      rememberAsset({
        name: project.name,
        type: project.type,
        kind: "json",
        pathOrKey,
        ext: "vxpj.json",
      });
      voxie.setBuildMode?.(usesVxw(project.type) ? "world" : "part");
      syncProjectUI();
      syncMeta();
      return;
    }

    // Plain volume JSON (legacy export)
    const vol = normalizeVolume(data);
    voxie.importVolume(vol);
    const bounds = vol.meta?.worldBounds
      ? normalizeWorldBounds(vol.meta.worldBounds)
      : readBoundsFromUI();
    const type =
      vol.meta?.vxwKind && usesVxw(vol.meta.vxwKind)
        ? vol.meta.vxwKind
        : vol.mode === "world"
          ? "world"
          : "part";
    const name = file.name.replace(/\.[^.]+$/, "") || `untitled_${type}`;
    const pathOrKey = isAssetsPath(file.name)
      ? file.name.replace(/\\/g, "/")
      : assetPathOrKey({ type, name, kind: "json" });
    project = createProject({
      type,
      name,
      worldBounds: bounds,
      assets: [{ id: "main", kind: "json", pathOrKey }],
    });
    voxie.setBuildMode?.(usesVxw(type) ? "world" : "part");
    rememberAsset({
      name: project.name,
      type: project.type,
      kind: "json",
      pathOrKey,
    });
    persistDraftSoon();
    syncMeta();
    syncColorUI();
    syncProjectUI();
    syncGroupsUI();
  }

  function savePrimaryAsset() {
    project = touchProject(project, {
      name: projectNameInput?.value?.trim() || project.name,
      type: projectTypeSel?.value || project.type,
      worldBounds: readBoundsFromUI(),
    });
    const bounds = normalizeWorldBounds(project.worldBounds);
    if (usesVxw(project.type)) writeBoundsToVolumeMeta(bounds);
    const vol = voxie.exportVolume();

    // Large volumes → binary .vxb (JSON/VXW stay for small/readable).
    if (shouldPreferBinary(vol)) {
      const buf = serializeVxb(vol, { scale: 1 });
      const pathOrKey = assetPathOrKey({
        type: project.type,
        name: project.name,
        kind: "vxb",
      });
      downloadBlob(
        assetDownloadFilename({ type: project.type, name: project.name, kind: "vxb" }),
        new Blob([buf], { type: "application/octet-stream" })
      );
      rememberAsset({
        name: project.name,
        type: project.type,
        kind: "vxb",
        pathOrKey,
      });
      saveDraft({ project, volume: vol });
      syncProjectUI();
      return;
    }

    if (usesVxw(project.type)) {
      const doc = serializeVxw(vol, {
        kind: project.type,
        bounds,
        name: project.name,
      });
      const pathOrKey = assetPathOrKey({
        type: project.type,
        name: project.name,
        kind: "vxw",
      });
      downloadJSON(
        assetDownloadFilename({ type: project.type, name: project.name, kind: "vxw" }),
        doc
      );
      rememberAsset({
        name: project.name,
        type: project.type,
        kind: "vxw",
        pathOrKey,
      });
      saveDraft({ project, volume: vol });
    } else {
      const pathOrKey = assetPathOrKey({
        type: project.type,
        name: project.name,
        kind: "json",
      });
      downloadJSON(
        assetDownloadFilename({ type: project.type, name: project.name, kind: "json" }),
        vol
      );
      rememberAsset({
        name: project.name,
        type: project.type,
        kind: "json",
        pathOrKey,
      });
      saveDraft({ project, volume: vol });
    }
    syncProjectUI();
  }

  function openPrefsModal() {
    if (!prefsModal) return;
    prefs = loadPrefs();
    if (prefsZMin) prefsZMin.value = String(prefs.zMin);
    if (prefsZMax) prefsZMax.value = prefs.zMax != null ? String(prefs.zMax) : "";
    if (prefsWater) prefsWater.value = prefs.waterLevel != null ? String(prefs.waterLevel) : "";
    if (prefsBorders) prefsBorders.checked = prefs.borders;
    if (prefsGrid) prefsGrid.checked = prefs.showGrid;
    if (prefsNoise) prefsNoise.checked = prefs.noiseTint;
    if (prefsLayer) prefsLayer.value = prefs.layerMode;
    if (prefsBrush) prefsBrush.value = String(prefs.brushSize);
    if (prefsNoiseAmt) {
      prefsNoiseAmt.value = String(Math.round(prefs.noiseAmount * 100));
      if (prefsNoiseAmtVal) prefsNoiseAmtVal.textContent = `${prefsNoiseAmt.value}%`;
    }
    if (prefsPotato) prefsPotato.checked = !!prefs.potatoMode;
    if (prefsAutoExpand) prefsAutoExpand.checked = prefs.autoExpand !== false;
    if (prefsShowAxes) prefsShowAxes.checked = prefs.showAxisGizmo === true;
    if (prefsSizeX) prefsSizeX.value = String(prefs.sizeX);
    if (prefsSizeY) prefsSizeY.value = String(prefs.sizeY);
    if (prefsSizeZ) prefsSizeZ.value = String(prefs.sizeZ);
    if (prefsMoveSpeed) prefsMoveSpeed.value = String(prefs.moveSpeed ?? 10);
    if (prefsMoveGridSnap) prefsMoveGridSnap.checked = !!prefs.keyboardGridSnap;
    prefsModal.hidden = false;
  }

  function closePrefsModal() {
    if (prefsModal) prefsModal.hidden = true;
  }

  function applyPrefsFromModal() {
    const prevPrefs = loadPrefs();
    const potato = !!prefsPotato?.checked;
    // Soft-default borders Off when Potato is first enabled; toggle still works after.
    const borders =
      potato && !prevPrefs.potatoMode ? false : !!prefsBorders?.checked;
    const next = normalizePrefs({
      ...prevPrefs,
      zMin: prefsZMin?.value !== "" ? Number(prefsZMin.value) : 0,
      zMax: prefsZMax?.value !== "" ? Number(prefsZMax.value) : null,
      waterLevel: prefsWater?.value !== "" ? Number(prefsWater.value) : null,
      borders,
      showGrid: !!prefsGrid?.checked,
      noiseTint: potato ? false : !!prefsNoise?.checked,
      layerMode: prefsLayer?.value || "all",
      brushSize: Number(prefsBrush?.value) === 3 ? 3 : 1,
      noiseAmount: Number(prefsNoiseAmt?.value || 8) / 100,
      potatoMode: potato,
      autoExpand: prefsAutoExpand ? !!prefsAutoExpand.checked : true,
      showAxisGizmo: prefsShowAxes ? !!prefsShowAxes.checked : false,
      sizeX: Number(prefsSizeX?.value) || 8,
      sizeY: Number(prefsSizeY?.value) || 8,
      sizeZ: Number(prefsSizeZ?.value) || 8,
      startSize: Number(prefsSizeX?.value) || 8,
      moveSpeed: prefsMoveSpeed?.value !== "" ? Number(prefsMoveSpeed.value) : 10,
      keyboardGridSnap: !!prefsMoveGridSnap?.checked,
    });
    prefs = savePrefs(next);
    applyPrefsToEditor(prefs);
    dock.sync?.();
    utilities.sync?.();
    const applySize = $("[data-prefs-apply-size]");
    if (applySize?.checked) {
      voxie.setWorldSize?.({ x: prefs.sizeX, y: prefs.sizeY, z: prefs.sizeZ });
    }
    if (zMinInput) zMinInput.value = String(prefs.zMin);
    if (zMaxInput) zMaxInput.value = prefs.zMax != null ? String(prefs.zMax) : "";
    if (waterInput) waterInput.value = prefs.waterLevel != null ? String(prefs.waterLevel) : "";
    if (usesVxw(project.type)) applyBoundsFromUI();
    closePrefsModal();
  }

  prefsClose?.addEventListener("click", closePrefsModal);
  prefsApply?.addEventListener("click", applyPrefsFromModal);
  prefsModal?.addEventListener("click", (e) => {
    if (e.target === prefsModal) closePrefsModal();
  });
  prefsNoiseAmt?.addEventListener("input", () => {
    if (prefsNoiseAmtVal) prefsNoiseAmtVal.textContent = `${prefsNoiseAmt.value}%`;
  });

  // --- Navbar (File chrome) + tools second bar ---
  navbar = bindNavbar(root, {
    onNewWorld: () => createNewDocument("world", { seedTerrain: true }),
    onNewAsset: () => createNewDocument("part"),
    onNewTerrain: () => {
      const asMap = !confirm(
        "Create Terrain / Map\n\nOK = Terrain (seeded ground)\nCancel = Map (empty world)"
      );
      createNewDocument(asMap ? "map" : "terrain", { seedTerrain: !asMap });
    },
    onOpen: () => projectOpenFile?.click(),
    onSave: () => {
      try {
        savePrimaryAsset();
      } catch (err) {
        console.error("[Voxie3D] save failed", err);
        alert("Save failed.");
      }
    },
    onSaveProject: () => projectSaveProjBtn?.click(),
    onRecent: (i) => restoreRecent(i),
    onPreferences: () => openPrefsModal(),
    onPerformance: () => focusUtilityPanel("performance"),
    onUtility: (id) => focusUtilityPanel(id),
    onOptions: () => focusUtilityPanel("options"),
    onBindings: () => focusUtilityPanel("bindings"),
    onExport: () => exportVolumeSmart(),
    onExportJson: () => exportVolumeJson(),
    onExportBinary: () => exportVolumeBinary(),
    onImport: () => importFile?.click(),
    onUndo: () => voxie.undo?.(),
    onRedo: () => voxie.redo?.(),
    onBendTime: () => bendTimeSession(),
    onDockSide: (side) => setDockSide(side),
    onPopOutActive: () => {
      const id = dock.getActivePanelId?.() || "place";
      popouts.popOut(id);
    },
    onPopOutPanel: (id) => popouts.popOut(id),
    onDockAllPopouts: () => {
      for (const id of popouts.listOut()) popouts.dockBack(id);
    },
    onTool: (tool) => {
      if (tool === "none") voxie.selection?.clear?.();
      voxie.setTool?.(tool);
      if (tool && tool !== "none") dock.setActivePanel?.(tool);
      syncMeta();
      toolsNav?.sync?.();
    },
    onToggleGrid: () => {
      const on = voxie.setGridVisible?.(!voxie.getGridVisible?.());
      if (gridToggle) gridToggle.checked = !!on;
      prefs = savePrefs({ ...prefs, showGrid: !!on });
      syncMeta();
    },
    onToggleAxisGizmo: () => {
      // Axes only apply in world mode (part sculpt hard-hides arrows).
      if (voxie.getState?.()?.mode !== "world") {
        voxie.setAxisGizmoVisible?.(false);
        return false;
      }
      const on = voxie.toggleAxisGizmo?.();
      prefs = savePrefs({ ...prefs, showAxisGizmo: !!on });
      return !!on;
    },
    listRecent: () => listRecentFiltered({ preferAssets: true }),
  });
  navbar?.setAxisGizmoLabel?.(voxie.getAxisGizmoVisible?.() ?? prefs.showAxisGizmo);

  toolsNav = bindToolsNavbar(root, {
    onSelect: selectToolNav,
    getActiveTool: () => voxie.getTool?.() || "",
    getActivePanel: () => dock.getActivePanelId?.() || "",
  });

  applyDockSide(root, prefs.dockSide || "left");

  const panel = bindForgePanel(voxie, root);

  // Separate tool buttons (subpanels later) — scroll to existing sections for now
  root.querySelector("[data-voxie-open-group-tool]")?.addEventListener("click", () => {
    root.querySelector("[data-voxie-group-start]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  root.querySelector("[data-voxie-open-tex-tool]")?.addEventListener("click", () => {
    voxie.setTool?.("texturizer");
    root.querySelector("[data-voxie-tex-generate]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    syncMeta();
  });

  function tryRestoreDraft() {
    const draft = loadDraft();
    if (!draft?.volume) return false;
    const when = draft.savedAt ? `\nSaved: ${draft.savedAt}` : "";
    const ok = confirm(
      `Restore previous voxel draw progress “${draft.project?.name || "untitled"}”?${when}\n\nCancel keeps the current empty/default scene.`
    );
    if (!ok) return false;
    project = createProject(draft.project);
    voxie.importVolume(draft.volume);
    voxie.setBuildMode?.(usesVxw(project.type) ? "world" : "part");
    syncMeta();
    syncColorUI();
    syncProjectUI();
    syncGroupsUI();
    return true;
  }

  voxie.onSliceChange(() => syncMeta());
  voxie.on("toolChange", () => {
    const t = voxie.getTool?.();
    if (t && t !== "none") dock.setActivePanel?.(t);
    syncMeta();
    syncControlsHelp();
    toolsNav?.sync?.();
    dock.sync?.();
  });
  voxie.on("shapeGenChange", () => {
    dock.sync?.();
  });
  voxie.on("colorChange", () => syncColorUI());
  voxie.on("groupsChange", () => syncGroupsUI());
  voxie.on("historyChange", () => {
    const st = voxie.getHistoryState?.() || {};
    root.querySelectorAll("[data-voxie-undo]").forEach((b) => {
      b.disabled = !st.canUndo;
    });
    root.querySelectorAll("[data-voxie-redo]").forEach((b) => {
      b.disabled = !st.canRedo;
    });
    dock.sync?.();
  });
  voxie.on("modeChange", () => {
    syncMeta();
    syncProjectUI();
  });
  voxie.onChange?.(() => {
    persistDraftSoon();
    syncGroupsUI();
  });

  applyPrefsToEditor(prefs);
  syncControlsHelp();
  syncColorUI();
  syncMeta();
  syncProjectUI();
  syncGroupsUI();
  const restoredDraft = tryRestoreDraft();
  // Empty part/asset boot: prefs may have toggled grid off — re-frame + force helpers.
  if (!restoredDraft && voxie.getState?.()?.mode === "part") {
    voxie.setGridVisible?.(true);
    if (gridToggle) gridToggle.checked = true;
    voxie.frameWorkspace?.({ ensureGrid: true, ensureSliceHelper: true });
  }

  return {
    syncColorUI,
    syncMeta,
    syncProjectUI,
    syncGroupsUI,
    getProject: () => project,
    setProject: (p) => {
      project = createProject(p);
      syncProjectUI();
    },
    openAssetFile,
    savePrimaryAsset,
    persistDraftSoon,
    createNewDocument,
    bendTimeSession,
    setDockSide,
    openPrefsModal,
    navbar,
    toolsNav,
    popouts,
    panel,
    dock,
    utilities,
  };
}
