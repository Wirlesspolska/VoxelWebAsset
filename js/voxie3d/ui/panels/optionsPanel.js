import { el, section, check, field } from "./dom.js";

export function createOptionsPanel() {
  const root = section("Options", { panel: "options" }, [
    el("h3", { className: "subhead", text: "Display" }),
    check("Voxel borders", { "data-voxie-border": "", checked: true }),
    check("Ground grid", { "data-voxie-grid": "", checked: true }),
    check("Isolate part", { "data-voxie-isolate": "" }),
    el("h3", { className: "subhead", text: "Camera" }),
    field("Move speed", {
      type: "number",
      min: "0.25",
      max: "64",
      step: "0.5",
      value: "10",
      "data-voxie-move-speed": "",
    }),
    check("Grid-snap move", { "data-voxie-move-grid-snap": "" }),
    el("label", { className: "field forge-legacy-io" }, [
      "Brush ",
      el("select", { "data-voxie-brush": "" }, [
        el("option", { value: "1", text: "1" }),
        el("option", { value: "3", text: "3" }),
      ]),
    ]),
  ]);
  return { root, bind() {}, id: "options" };
}
