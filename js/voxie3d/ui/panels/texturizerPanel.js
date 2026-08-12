import { el, section } from "./dom.js";

/**
 * Textures — generator + palette, mounted high in left dock (after Color).
 */
export function createTexturizerPanel() {
  const root = section("Textures", { panel: "texturizer", "data-voxie-textures-panel": "" }, [
    el("p", {
      className: "forge-tag",
      text: "Weighted dice noise → 8×8 / 16×16 · Clone a weight, nudge hue for variation",
    }),

    el("h3", { className: "subhead", text: "Generator" }),
    el("label", { className: "field" }, [
      "Size ",
      el("select", { "data-voxie-tex-size": "" }, [
        el("option", { value: "8", text: "8×8" }),
        el("option", { value: "16", text: "16×16" }),
      ]),
    ]),

    el("div", { className: "tex-preview-row" }, [
      el("canvas", {
        className: "tex-preview",
        "data-voxie-tex-preview": "",
        width: "96",
        height: "96",
        title: "Live texture preview",
      }),
      el("div", { className: "tex-preview-meta" }, [
        el("p", { className: "forge-tag", "data-voxie-tex-preview-label": "", text: "Preview" }),
        el("div", { className: "row" }, [
          el("button", {
            type: "button",
            className: "btn",
            "data-voxie-tex-generate": "",
            text: "Generate",
            title: "Dice-roll new seed into palette",
          }),
          el("button", {
            type: "button",
            className: "btn",
            "data-voxie-tex-reroll": "",
            text: "Dice",
            title: "Reroll preview seed",
          }),
        ]),
      ]),
    ]),

    el("h3", { className: "subhead", text: "RGB weights" }),
    el("div", { className: "tex-weights", "data-voxie-tex-weights": "" }),
    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn is-active",
        "data-voxie-tex-add-current": "",
        text: "Add current color",
        title: "Push Color picker RGB into weight list",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-tex-add-weight": "",
        text: "Add weight",
      }),
    ]),

    el("h3", { className: "subhead", text: "Texture palette" }),
    el("div", { className: "tex-palette", "data-voxie-tex-palette": "" }),

    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-tex-apply": "",
        text: "Apply to selection",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-tex-apply-group": "",
        text: "Apply to group",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-tex-use-brush": "",
        text: "Use on brush",
        title: "Set active texture for Texturizer / place",
      }),
    ]),

    el("div", { className: "row" }, [
      el("button", { type: "button", className: "btn", "data-voxie-tex-export": "", text: "Export pack" }),
      el("button", { type: "button", className: "btn", "data-voxie-tex-import": "", text: "Import shard…" }),
    ]),
    el("input", {
      type: "file",
      accept: ".json,application/json",
      "data-voxie-tex-import-file": "",
      hidden: true,
    }),
  ]);

  return { root, bind() {}, id: "texturizer", kind: "tool", toolId: "texturizer" };
}

