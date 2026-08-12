import { el, section, check } from "./dom.js";



/**

 * Tools + snap modes.

 * @returns {{ root: HTMLElement, bind: (voxie: object, syncMeta: Function) => void }}

 */

export function createToolsPanel() {

  const root = section("Tools", { panel: "tools" }, [

    el("div", { className: "row" }, [

      el("button", { type: "button", className: "btn is-active", "data-voxie-tool": "place", text: "Place" }),

      el("button", { type: "button", className: "btn", "data-voxie-tool": "erase", text: "Erase" }),

      el("button", { type: "button", className: "btn", "data-voxie-tool": "select", text: "Select" }),

      el("button", { type: "button", className: "btn", "data-voxie-tool": "shape", text: "Shape" }),

      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-tool": "generate",
        text: "Generate shape",
        title: "Procedural stamps — scroll rerolls variant · LMB release stamps",
      }),

      el("button", { type: "button", className: "btn", "data-voxie-tool": "stroke", text: "Stroke" }),

      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-tool": "texturizer",
        "data-voxie-open-tex-tool": "",
        text: "Textures",
        title: "Jump to Textures panel",
      }),

      el("button", { type: "button", className: "btn", "data-voxie-open-group-tool": "", text: "Groups" }),

      el("button", { type: "button", className: "btn", "data-voxie-tool": "none", text: "Deselect" }),

    ]),

    el("p", {
      className: "forge-tag",
      text: "LMB paint · RMB erase · Alt+LMB orbit · Shift select · Esc clears",
    }),

    el("h3", { className: "subhead", text: "Snap" }),

    el("div", { className: "row" }, [

      el("button", {

        type: "button",

        className: "btn is-active",

        "data-voxie-snap": "block",

        text: "Snap to block",

        title: "Camera-facing adjacent cell of nearest hit",

      }),

      el("button", {

        type: "button",

        className: "btn",

        "data-voxie-snap": "free",

        text: "Free snap",

        title: "Camera-weighted depth along view ray",

      }),

    ]),

    check("Paint drag (legacy)", {
      "data-voxie-paint-drag": "",
      title: "Legacy pref — Place/Erase already hold-stream without this",
    }),

  ]);



  function bind(voxie, syncMeta) {

    root.querySelectorAll("[data-voxie-snap]").forEach((btn) => {

      btn.addEventListener("click", () => {

        const mode = btn.dataset.voxieSnap === "free" ? "free" : "block";

        voxie.setSnapMode?.(mode);

        root.querySelectorAll("[data-voxie-snap]").forEach((b) => {

          b.classList.toggle("is-active", b.dataset.voxieSnap === mode);

        });

        syncMeta?.();

      });

    });

    const st = voxie.getState?.();

    const mode = st?.snapMode === "free" ? "free" : "block";

    root.querySelectorAll("[data-voxie-snap]").forEach((b) => {

      b.classList.toggle("is-active", b.dataset.voxieSnap === mode);

    });

  }



  return { root, bind, id: "tools" };

}


