/**
 * Thin Voxie3D host — UI shell only; sculpt logic lives in js/voxie3d/.
 */
import { createVoxie3D, PRESET_COLORS, loadPrefs } from "../voxie3d/index.js";
import { bindForgeHud } from "../voxie3d/ui/bindForgeHud.js";

const stage = document.getElementById("forge-stage");
const canvas = document.getElementById("forge-canvas");
const prefs = loadPrefs();
const start = prefs.startSize || prefs.sizeX || 8;

const voxie = createVoxie3D(canvas, {
  mode: "part",
  size: start,
  worldSize: { x: prefs.sizeX || start, y: prefs.sizeY || start, z: prefs.sizeZ || start },
  tool: "place",
  borders: prefs.borders !== false,
  layerMode: prefs.layerMode,
  brushSize: prefs.brushSize,
  showGrid: prefs.showGrid,
  noiseTint: false,
  paintDrag: false,
  noiseAmount: prefs.noiseAmount,
  potatoMode: !!prefs.potatoMode,
  autoExpand: prefs.autoExpand !== false,
  meshMode: prefs.meshMode || "instances",
  // Part/asset forge: no axis arrows while sculpting (Axes toggle can re-enable).
  showAxisGizmo: false,
  brushW: prefs.brushW || 1,
  brushH: prefs.brushH || 1,
  brushShape: prefs.brushShape || "rect",
  circleRadius: prefs.circleRadius || 4,
  colorHSB: { h: 72, s: 55, b: 88 },
  background: "#0c0e0a",
  terrain: false,
  characters: false,
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
      voxie.setMaterialId?.(null);
      voxie.setColorHex(hex);
    });
    presetRow.appendChild(btn);
  }
}

void stage;
