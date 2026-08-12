import { el, section } from "./dom.js";



export function createShapesPanel() {

  // Panel id must match registry / navbar: "shape" (not "shapes").
  const root = section("Shapes", { panel: "shape", "data-voxie-panel": "shape" }, [

    el("div", { className: "row" }, [

      el("button", { type: "button", className: "btn is-active", "data-voxie-shape": "rect", text: "Rect" }),

      el("button", { type: "button", className: "btn", "data-voxie-shape": "diamond", text: "Diamond" }),

      el("button", { type: "button", className: "btn", "data-voxie-shape": "line", text: "Line" }),

    ]),

    el("p", { className: "forge-tag", text: "Drag on plane — ghost then commit" }),

  ]);

  return { root, bind() {}, id: "shape", kind: "tool", toolId: "shape" };

}



