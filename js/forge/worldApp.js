/**
 * Thin Voxie3D world host — terrain authoring (no preview pawns).
 */
import { createVoxie3D, PRESET_COLORS, hashSeed, loadPrefs } from "../voxie3d/index.js";
import { bindForgeHud } from "../voxie3d/ui/bindForgeHud.js";

const canvas = document.getElementById("forge-canvas");
const prefs = loadPrefs();

/** Larger default world footprint — use Performance mesh mode if FPS dips. */
const DEFAULT_WORLD = { x: 64, y: 48, z: 64 };
const startSeed = hashSeed("voxie-world-demo", "v1");

const voxie = createVoxie3D(canvas, {
  mode: "world",
  worldSize: DEFAULT_WORLD,
  seed: startSeed,
  terrain: { caves: true, dirtDepth: 3, biome: "greenery", chunkSize: 64 },
  characters: false,
  tool: "place",
  borders: prefs.borders === true,
  layerMode: prefs.layerMode || "all",
  potatoMode: !!prefs.potatoMode,
  meshMode: prefs.meshMode || "instances",
  blockTextures: prefs.blockTextures !== false,
  autoExpand: prefs.autoExpand !== false,
  // World: axes optional via prefs / Axes toggle (default off).
  showAxisGizmo: prefs.showAxisGizmo === true,
  noiseTint: false,
  paintDrag: false,
  colorHSB: { h: 110, s: 40, b: 70 },
  brushSize: prefs.brushSize === 3 ? 3 : 1,
  background: "#0c0e0a",
});

bindForgeHud(voxie, document);

const presetRow = document.getElementById("preset-row");
if (presetRow) {
  for (const hex of PRESET_COLORS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.title = hex;
    btn.style.width = "28px";
    btn.style.height = "22px";
    btn.style.padding = "0";
    btn.style.background = hex;
    btn.addEventListener("click", () => {
      voxie.setColorHex(hex);
    });
    presetRow.appendChild(btn);
  }
}

const seedInput = document.querySelector("[data-voxie-seed]");
const seedVal = document.querySelector("[data-voxie-seed-val]");
const regenBtn = document.querySelector("[data-voxie-regen]");
const sizeEl = document.querySelector("[data-voxie-world-size]");
const modeEl = document.querySelector("[data-voxie-mode]");

function syncWorldMeta() {
  const st = voxie.getState();
  const ws = st.worldSize;
  if (sizeEl) sizeEl.textContent = `${ws.x}×${ws.y}×${ws.z}`;
  if (modeEl) modeEl.textContent = st.mode;
  if (seedInput && st.seed != null) seedInput.value = String(st.seed);
  if (seedVal && st.seed != null) seedVal.textContent = String(st.seed);
}

regenBtn?.addEventListener("click", () => {
  const raw = seedInput?.value?.trim();
  let seed;
  if (raw && /^\d+$/.test(raw)) seed = Number(raw) >>> 0;
  else if (raw) seed = hashSeed(raw);
  else seed = (Math.random() * 0xffffffff) >>> 0;
  if (seedInput) seedInput.value = String(seed);
  voxie.generateTerrain(seed, { caves: true, dirtDepth: 3 });
  syncWorldMeta();
});

seedInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") regenBtn?.click();
});

voxie.on("terrainGenerated", () => syncWorldMeta());
voxie.on("chunkGenDone", () => syncWorldMeta());
voxie.on("chunkGenProgress", () => syncWorldMeta());
syncWorldMeta();
