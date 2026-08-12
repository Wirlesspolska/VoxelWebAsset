import { el, section, check } from "./dom.js";



export function createStrokePanel() {

  const root = section("Stroke", { panel: "stroke", "data-voxie-panel": "stroke" }, [

    el("label", { className: "field" }, [

      "Length ",

      el("input", { type: "number", min: "1", max: "64", value: "5", "data-voxie-stroke-len": "" }),

    ]),

    check("Smooth stair", { "data-voxie-stroke-smooth": "" }),

    check("Attach as group", { "data-voxie-stroke-group": "" }),

    el("p", { className: "forge-tag", text: "Click anchor → aim direction ghost → release" }),

  ]);

  return { root, bind() {}, id: "stroke", kind: "tool", toolId: "stroke" };

}



