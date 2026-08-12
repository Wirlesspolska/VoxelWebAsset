import { el, section } from "./dom.js";
import { BRUSH_PRESETS } from "../../tools/brushes.js";

const MAX = 32;

/**
 * Brush panel — integer W×H inputs (not dropdown-only).
 * Presets fill the ints; typing updates brush immediately via `input`.
 */
export function createBrushPanel() {
  const presetsHost = el("div", { className: "row", "data-voxie-brush-presets": "" });
  const wInput = el("input", {
    type: "number",
    min: "1",
    max: String(MAX),
    value: "1",
    step: "1",
    "data-voxie-brush-w": "",
    title: "Brush width (integer)",
  });
  const hInput = el("input", {
    type: "number",
    min: "1",
    max: String(MAX),
    value: "1",
    step: "1",
    "data-voxie-brush-h": "",
    title: "Brush height (integer)",
  });
  const rInput = el("input", {
    type: "number",
    min: "1",
    max: "16",
    value: "4",
    step: "1",
    "data-voxie-circle-r": "",
  });

  // Nested under Place/Erase: leave data-voxie-panel to the dock host for the standalone Brush entry.
  const root = section("Brush", { panel: "brush" }, [
    presetsHost,
    el("label", { className: "field" }, ["W ", wInput]),
    el("label", { className: "field" }, ["H ", hInput]),
    el("p", { className: "forge-tag", text: "Size as ints: W × H (1–32)" }),
    el("div", { className: "row" }, [
      el("button", { type: "button", className: "btn is-active", "data-voxie-brush-mode": "rect", text: "Rect" }),
      el("button", { type: "button", className: "btn", "data-voxie-brush-mode": "circle", text: "Circle" }),
    ]),
    el("label", { className: "field" }, ["Circle R ", rInput]),
  ]);

  function clampInt(n, lo, hi) {
    const v = Number(n);
    if (!Number.isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v | 0));
  }

  function applyWH(voxie) {
    const w = clampInt(wInput.value, 1, MAX);
    const h = clampInt(hInput.value, 1, MAX);
    wInput.value = String(w);
    hInput.value = String(h);
    voxie.setBrushRect?.(w, h);
  }

  function sync(voxie) {
    const st = voxie.getBrushState?.() || voxie.getState?.() || {};
    wInput.value = String(st.brushW ?? 1);
    hInput.value = String(st.brushH ?? 1);
    rInput.value = String(st.circleRadius ?? 4);
    root.querySelectorAll("[data-voxie-brush-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.voxieBrushMode === (st.brushShape || "rect"));
    });
    presetsHost.querySelectorAll("[data-voxie-brush-preset]").forEach((btn) => {
      const w = Number(btn.dataset.w);
      const h = Number(btn.dataset.h);
      btn.classList.toggle(
        "is-active",
        st.brushShape !== "circle" && Number(st.brushW) === w && Number(st.brushH) === h
      );
    });
  }

  function bind(voxie) {
    presetsHost.innerHTML = "";
    for (const p of BRUSH_PRESETS) {
      const btn = el("button", {
        type: "button",
        className: "btn",
        text: p.label,
        "data-voxie-brush-preset": p.id,
        "data-w": String(p.w),
        "data-h": String(p.h),
      });
      btn.addEventListener("click", () => {
        voxie.setBrushRect?.(p.w, p.h);
        sync(voxie);
      });
      presetsHost.appendChild(btn);
    }

    const onWH = () => {
      applyWH(voxie);
      sync(voxie);
    };
    wInput.addEventListener("input", onWH);
    hInput.addEventListener("input", onWH);
    wInput.addEventListener("change", onWH);
    hInput.addEventListener("change", onWH);

    rInput.addEventListener("input", () => {
      voxie.setCircleRadius?.(clampInt(rInput.value, 1, 16));
      sync(voxie);
    });

    root.querySelectorAll("[data-voxie-brush-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        voxie.setBrushShape?.(btn.dataset.voxieBrushMode);
        if (btn.dataset.voxieBrushMode === "circle") {
          voxie.setCircleRadius?.(clampInt(rInput.value, 1, 16));
        }
        sync(voxie);
      });
    });

    voxie.on?.("brushChange", () => sync(voxie));
    sync(voxie);
  }

  return { root, bind, sync, id: "brush" };
}
