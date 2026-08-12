import { el, section } from "./dom.js";

export function createSelectionPanel() {
  // Panel id must match registry / navbar: "select" (not "selection").
  const root = section("Selection", { panel: "select", "data-voxie-panel": "select" }, [
    el("div", { className: "attrs", "data-voxie-selection-attrs": "" }, [
      el("p", { className: "forge-tag", text: "Shift+click / Shift+drag box" }),
    ]),
    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn is-active",
        "data-voxie-sel-recolor": "",
        text: "Recolor selection",
        title: "Paint current Color (or active texture) onto all selected voxels in one batch",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-sel-shade": "",
        text: "Natural shade",
        title: "Top-light brightness ramp across selection",
      }),
      el("button", {
        type: "button",
        className: "btn btn-danger",
        "data-voxie-sel-delete": "",
        text: "Delete",
      }),
    ]),
    el("label", { className: "field" }, [
      "Effect ",
      el("select", { "data-voxie-effect": "" }, [
        el("option", { value: "shadow", text: "Shadow" }),
        el("option", { value: "glow", text: "Glow" }),
        el("option", { value: "outline", text: "Outline" }),
        el("option", { value: "emboss", text: "Emboss" }),
      ]),
    ]),
    el("button", { type: "button", className: "btn", "data-voxie-effect-apply": "", text: "Apply effect" }),
  ]);
  return { root, bind() {}, id: "select", kind: "tool", toolId: "select" };
}

