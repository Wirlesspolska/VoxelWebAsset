import { el, section, check } from "./dom.js";
import { loadPrefs, savePrefs, normalizePrefs } from "../prefs.js";

const FPS_OPTS = [
  { value: "0", label: "Off / uncapped (rAF · vsync-ish)" },
  { value: "30", label: "30 FPS" },
  { value: "60", label: "60 FPS" },
  { value: "120", label: "120 FPS" },
];

const DPR_OPTS = [
  { value: "0.5", label: "0.5×" },
  { value: "1", label: "1×" },
  { value: "1.5", label: "1.5×" },
  { value: "2", label: "2×" },
];

const LOD_OPTS = [
  { value: "off", label: "Off (full detail)" },
  { value: "distance", label: "Distance (far = no borders)" },
  { value: "center-cone", label: "Center cone (focus = full)" },
];

const PATH_OPTS = [
  { value: "gpu", label: "GPU surface mesh (default)" },
  { value: "cpu-lite", label: "CPU-lite (coalesce · main pack)" },
];

const MESH_OPTS = [
  { value: "instances", label: "Full cubes (default)" },
  { value: "hybrid", label: "Hybrid (near cubes · far greedy)" },
  { value: "greedy", label: "Greedy surface (opt-in)" },
];

const THREAD_OPTS = [
  { value: "0", label: "0 — off (main thread only)" },
  { value: "1", label: "1 thread" },
  { value: "2", label: "2 threads" },
  { value: "auto", label: "Auto (hardwareConcurrency, max 4)" },
];

const POWER_OPTS = [
  { value: "default", label: "Default (browser decides)" },
  { value: "low-power", label: "Low power" },
  { value: "high-performance", label: "High performance" },
];

const PRECISION_OPTS = [
  { value: "highp", label: "highp" },
  { value: "mediump", label: "mediump" },
];

/**
 * Performance dock panel — persists via prefs + applies to voxie API.
 */
export function createPerformancePanel() {
  const fpsSelect = el(
    "select",
    { "data-perf-fps": "" },
    FPS_OPTS.map((o) => el("option", { value: o.value, text: o.label }))
  );
  const dprSelect = el(
    "select",
    { "data-perf-dpr": "" },
    DPR_OPTS.map((o) => el("option", { value: o.value, text: o.label }))
  );
  const lodSelect = el(
    "select",
    { "data-perf-lod": "" },
    LOD_OPTS.map((o) => el("option", { value: o.value, text: o.label }))
  );
  const pathSelect = el(
    "select",
    { "data-perf-path": "" },
    PATH_OPTS.map((o) => el("option", { value: o.value, text: o.label }))
  );
  const meshSelect = el(
    "select",
    {
      "data-perf-mesh-mode": "",
      title:
        "Surface meshing skips buried faces and merges coplanar quads. Fewer polys beat micro-opts.",
    },
    MESH_OPTS.map((o) => el("option", { value: o.value, text: o.label }))
  );
  const threadsSelect = el(
    "select",
    {
      "data-perf-mesh-threads": "",
      title: "Worker pool for chunk mesh packing (GPU path). 0 = pack on main thread.",
    },
    THREAD_OPTS.map((o) => el("option", { value: o.value, text: o.label }))
  );
  const powerSelect = el(
    "select",
    {
      "data-perf-gpu-power": "",
      title:
        "WebGL powerPreference. Changing this recreates the WebGL context (brief flicker).",
    },
    POWER_OPTS.map((o) => el("option", { value: o.value, text: o.label }))
  );
  const precisionSelect = el(
    "select",
    {
      "data-perf-precision": "",
      title: "WebGLRenderer shader precision — recreates context on change.",
    },
    PRECISION_OPTS.map((o) => el("option", { value: o.value, text: o.label }))
  );
  const coalesceInput = el("input", {
    type: "number",
    min: "0",
    max: "250",
    step: "1",
    value: "0",
    "data-perf-coalesce": "",
    title: "0 = next animation frame (CPU-lite floors to 16ms)",
  });
  const maxDirtyInput = el("input", {
    type: "number",
    min: "0",
    max: "256",
    step: "1",
    value: "0",
    "data-perf-max-dirty": "",
    title: "0 = unlimited",
  });
  const lodNearInput = el("input", {
    type: "number",
    min: "4",
    max: "512",
    step: "1",
    value: "28",
    "data-perf-lod-near": "",
    title: "Full detail within this distance (cells ≈ world units)",
  });
  const lodFarInput = el("input", {
    type: "number",
    min: "8",
    max: "1024",
    step: "1",
    value: "72",
    "data-perf-lod-far": "",
    title: "Reduced detail band; farther may hide",
  });
  const maxInstInput = el("input", {
    type: "number",
    min: "0",
    max: "2000000",
    step: "1000",
    value: "0",
    "data-perf-max-inst": "",
    title: "0 = unlimited; nearest chunks kept first",
  });
  const semiBtn = el("button", {
    type: "button",
    className: "btn",
    "data-perf-semi-potato": "",
    text: "Semi-potato preset",
    title:
      "LOD distance + borders near-only + DPR 1× + low-power GPU + 1 mesh thread (full potato off)",
  });

  const root = section("Performance", { panel: "performance" }, [
    el("p", {
      className: "forge-tag",
      text: "Frame pacing · LOD · CPU threads · GPU context. Saved locally.",
    }),
    el("label", { className: "field" }, ["FPS limit ", fpsSelect]),
    el("label", { className: "field" }, ["Max pixel ratio ", dprSelect]),
    el("h3", { className: "subhead", text: "Quality" }),
    check("Potato mode", { "data-perf-potato": "" }),
    el("p", {
      className: "forge-tag",
      text: "Semi-potato = LOD on, far borders off, DPR 1×, low-power GPU, 1 mesh thread.",
    }),
    semiBtn,
    check("Shadows", {
      "data-perf-shadows": "",
      title: "Only when a user light exists (Volume → Place light). Ambient-only = no shadow maps.",
    }),
    check("Block textures", {
      "data-perf-block-tex": "",
      checked: true,
      title: "Terrain atlas (grass/dirt/…). Potato uses flat tile colors.",
    }),
    check("Voxel borders", { "data-perf-borders": "" }),
    check("Borders near-only", {
      "data-perf-borders-near": "",
      title: "Draw edges only on near / focus chunks",
    }),
    check("Noise tint", { "data-perf-noise": "" }),
    el("h3", { className: "subhead", text: "LOD / distance detail" }),
    el("label", { className: "field" }, ["LOD mode ", lodSelect]),
    el("label", { className: "field" }, ["LOD near ", lodNearInput]),
    el("label", { className: "field" }, ["LOD far ", lodFarInput]),
    el("h3", { className: "subhead", text: "CPU (meshing)" }),
    el("label", { className: "field" }, ["Mesh mode ", meshSelect]),
    el("p", {
      className: "forge-tag",
      text:
        "Full cubes are the authoring default. Greedy/hybrid drop hidden faces (fewer tris) but can look like half-blocks while editing — opt in only if you want that.",
    }),
    el("label", { className: "field" }, ["CPU threads (meshing) ", threadsSelect]),
    el("p", {
      className: "forge-tag",
      text: "Worker pool for chunk surface meshing. Ignored on CPU-lite path. Auto caps at 4.",
    }),
    el("label", { className: "field" }, ["Render path ", pathSelect]),
    el("label", { className: "field" }, ["Max voxels on screen (budget) ", maxInstInput]),
    el("label", { className: "field" }, ["Chunk rebuild coalesce (ms) ", coalesceInput]),
    el("label", { className: "field" }, ["Max dirty chunks / frame ", maxDirtyInput]),
    el("h3", { className: "subhead", text: "GPU" }),
    el("label", { className: "field" }, ["GPU power preference ", powerSelect]),
    check("Antialias", {
      "data-perf-antialias": "",
      checked: true,
      title: "WebGL MSAA — recreates the renderer when toggled",
    }),
    el("label", { className: "field" }, ["Precision ", precisionSelect]),
    el("p", {
      className: "forge-tag",
      text: "Power / antialias / precision recreate the WebGL context (short flicker; camera rebinds).",
    }),
    check("Skip idle render", {
      "data-perf-skip-idle": "",
      title: "Skip WebGL when camera still and meshes idle",
    }),
    check("Show FPS overlay", { "data-perf-fps-overlay": "", checked: true }),
  ]);

  function readUi() {
    const threadsRaw = threadsSelect.value;
    const meshWorkerThreads =
      threadsRaw === "0" ? 0 : threadsRaw === "1" ? 1 : threadsRaw === "2" ? 2 : "auto";
    const meshRaw = meshSelect.value;
    const meshMode =
      meshRaw === "hybrid" || meshRaw === "greedy" ? meshRaw : "instances";
    return {
      fpsLimit: Number(fpsSelect.value) || 0,
      pixelRatioCap: Number(dprSelect.value) || 2,
      potatoMode: !!root.querySelector("[data-perf-potato]")?.checked,
      shadows: !!root.querySelector("[data-perf-shadows]")?.checked,
      blockTextures: !!root.querySelector("[data-perf-block-tex]")?.checked,
      borders: !!root.querySelector("[data-perf-borders]")?.checked,
      bordersNearOnly: !!root.querySelector("[data-perf-borders-near]")?.checked,
      noiseTint: !!root.querySelector("[data-perf-noise]")?.checked,
      lodMode: lodSelect.value || "off",
      lodNear: Number(lodNearInput.value) || 28,
      lodFar: Number(lodFarInput.value) || 72,
      renderPath: pathSelect.value === "cpu-lite" ? "cpu-lite" : "gpu",
      maxInstances: Number(maxInstInput.value) || 0,
      meshMode,
      meshWorkerThreads,
      meshWorker: meshWorkerThreads !== 0,
      chunkCoalesceMs: Number(coalesceInput.value) || 0,
      maxDirtyChunksPerFrame: Number(maxDirtyInput.value) || 0,
      gpuPowerPreference: powerSelect.value || "high-performance",
      antialias: !!root.querySelector("[data-perf-antialias]")?.checked,
      shaderPrecision: precisionSelect.value === "mediump" ? "mediump" : "highp",
      skipIdleRender: !!root.querySelector("[data-perf-skip-idle]")?.checked,
      showFpsOverlay: !!root.querySelector("[data-perf-fps-overlay]")?.checked,
    };
  }

  function writeUi(p) {
    const next = normalizePrefs(p);
    fpsSelect.value = String(next.fpsLimit || 0);
    dprSelect.value = String(next.pixelRatioCap ?? 2);
    lodSelect.value = next.lodMode || "off";
    pathSelect.value = next.renderPath === "cpu-lite" ? "cpu-lite" : "gpu";
    meshSelect.value =
      next.meshMode === "hybrid" || next.meshMode === "greedy"
        ? next.meshMode
        : "instances";
    threadsSelect.value =
      next.meshWorkerThreads === 0
        ? "0"
        : next.meshWorkerThreads === 1
          ? "1"
          : next.meshWorkerThreads === 2
            ? "2"
            : "auto";
    powerSelect.value = next.gpuPowerPreference || "high-performance";
    precisionSelect.value = next.shaderPrecision === "mediump" ? "mediump" : "highp";
    const potato = root.querySelector("[data-perf-potato]");
    const shadows = root.querySelector("[data-perf-shadows]");
    const blockTex = root.querySelector("[data-perf-block-tex]");
    const borders = root.querySelector("[data-perf-borders]");
    const bordersNear = root.querySelector("[data-perf-borders-near]");
    const noise = root.querySelector("[data-perf-noise]");
    const antialias = root.querySelector("[data-perf-antialias]");
    const skipIdle = root.querySelector("[data-perf-skip-idle]");
    const fpsOv = root.querySelector("[data-perf-fps-overlay]");
    if (potato) potato.checked = !!next.potatoMode;
    if (shadows) shadows.checked = next.potatoMode ? false : !!next.shadows;
    if (blockTex) blockTex.checked = next.blockTextures !== false;
    // Borders stay togglable in Potato — never force-disable the control.
    if (borders) {
      borders.checked = !!next.borders;
      borders.disabled = false;
    }
    if (bordersNear) bordersNear.checked = !!next.bordersNearOnly;
    if (noise) noise.checked = next.potatoMode ? false : !!next.noiseTint;
    if (antialias) {
      antialias.checked = next.potatoMode ? false : next.antialias !== false;
      antialias.disabled = !!next.potatoMode;
    }
    if (skipIdle) skipIdle.checked = !!next.skipIdleRender;
    lodNearInput.value = String(next.lodNear ?? 28);
    lodFarInput.value = String(next.lodFar ?? 72);
    maxInstInput.value = String(next.maxInstances ?? 0);
    coalesceInput.value = String(next.chunkCoalesceMs ?? 0);
    maxDirtyInput.value = String(next.maxDirtyChunksPerFrame ?? 0);
    if (fpsOv) fpsOv.checked = next.showFpsOverlay !== false;
    if (shadows) shadows.disabled = !!next.potatoMode;
    if (noise) noise.disabled = !!next.potatoMode;
  }

  function apply(voxie) {
    const prev = loadPrefs();
    const patch = readUi();
    // Soft-default borders Off when Potato is first enabled (user can re-enable).
    if (patch.potatoMode && !prev.potatoMode) {
      patch.borders = false;
      patch.gpuPowerPreference = "low-power";
      patch.antialias = false;
      patch.shaderPrecision = "mediump";
      if (patch.meshWorkerThreads === "auto" || patch.meshWorkerThreads > 1) {
        patch.meshWorkerThreads = 1;
      }
    }
    const prefs = savePrefs({ ...prev, ...patch });
    voxie.applyPerformancePrefs?.(prefs);
    voxie.setBorder?.(prefs.borders);
    voxie.setNoiseTint?.(prefs.potatoMode ? false : prefs.noiseTint);
    writeUi(prefs);
  }

  function applySemiPotato(voxie) {
    const prev = loadPrefs();
    const prefs = savePrefs({
      ...prev,
      lodMode: "distance",
      bordersNearOnly: true,
      borders: true,
      pixelRatioCap: 1,
      potatoMode: false,
      gpuPowerPreference: "low-power",
      antialias: false,
      meshWorkerThreads: 1,
      meshWorker: true,
      shaderPrecision: "mediump",
    });
    voxie.applyPerformancePrefs?.(prefs);
    voxie.setBorder?.(prefs.borders);
    writeUi(prefs);
  }

  function bind(voxie) {
    writeUi(loadPrefs());
    voxie.applyPerformancePrefs?.(loadPrefs());

    const onChange = () => apply(voxie);
    fpsSelect.addEventListener("change", onChange);
    dprSelect.addEventListener("change", onChange);
    lodSelect.addEventListener("change", onChange);
    pathSelect.addEventListener("change", onChange);
    threadsSelect.addEventListener("change", onChange);
    powerSelect.addEventListener("change", onChange);
    precisionSelect.addEventListener("change", onChange);
    coalesceInput.addEventListener("change", onChange);
    maxDirtyInput.addEventListener("change", onChange);
    lodNearInput.addEventListener("change", onChange);
    lodFarInput.addEventListener("change", onChange);
    maxInstInput.addEventListener("change", onChange);
    root.querySelectorAll("input[type=checkbox]").forEach((inp) => {
      inp.addEventListener("change", onChange);
    });
    semiBtn.addEventListener("click", () => applySemiPotato(voxie));

    voxie.on?.("potatoModeChange", () => writeUi(loadPrefs()));
    voxie.on?.("perfChange", () => writeUi(loadPrefs()));
  }

  return {
    root,
    id: "performance",
    bind,
    sync(voxie) {
      void voxie;
      writeUi(loadPrefs());
    },
    focus() {
      root.classList.remove("is-collapsed");
      root.removeAttribute("data-collapsed");
      root.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    },
  };
}
