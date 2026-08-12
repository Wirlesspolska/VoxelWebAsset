import { el, section } from "./dom.js";

export function createWorldBoundsPanel() {
  const root = section("World bounds", { panel: "world-bounds", "data-voxie-world-bounds": "", hidden: true }, [
    el("label", { className: "field" }, [
      "zMin ",
      el("input", { type: "number", "data-voxie-zmin": "", value: "0", step: "1" }),
    ]),
    el("label", { className: "field" }, [
      "zMax ",
      el("input", { type: "number", "data-voxie-zmax": "", value: "", step: "1", placeholder: "none" }),
    ]),
    el("label", { className: "field" }, [
      "Water ",
      el("input", { type: "number", "data-voxie-water-level": "", value: "", step: "1", placeholder: "sea Z" }),
    ]),
  ]);
  return { root, bind() {}, id: "world-bounds" };
}
