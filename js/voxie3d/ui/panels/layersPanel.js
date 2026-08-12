import { el, section } from "./dom.js";

export function createLayersPanel() {
  const root = section("Layers", { panel: "layers" }, [
    el("div", { className: "row" }, [
      el("button", { type: "button", className: "btn is-active", "data-voxie-layer": "all", text: "All" }),
      el("button", { type: "button", className: "btn", "data-voxie-layer": "active", text: "Active only" }),
      el("button", { type: "button", className: "btn", "data-voxie-layer": "base+active", text: "Base + active" }),
    ]),
    el("div", { className: "meta" }, [
      el("span", { text: "Plane" }),
      el("strong", { "data-voxie-axis": "", text: "Z" }),
      el("span", { text: "Slice" }),
      el("strong", { "data-voxie-slice": "", text: "0" }),
      el("span", { text: "Tool" }),
      el("strong", { "data-voxie-tool-label": "", text: "place" }),
    ]),
  ]);
  return { root, bind() {}, id: "layers" };
}
