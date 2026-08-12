import { el, section } from "./dom.js";



export function createProjectPanel() {

  const root = section("Project", { panel: "project" }, [

    el("p", { className: "forge-tag", text: "File menu is primary. Name / type here." }),

    el("label", { className: "field" }, [

      "Name ",

      el("input", { type: "text", "data-voxie-project-name-input": "", value: "untitled_part" }),

    ]),

    el("label", { className: "field" }, [

      "Type ",

      el("select", { "data-voxie-project-type": "" }, [

        el("option", { value: "part", text: "part", selected: true }),

        el("option", { value: "world", text: "world" }),

        el("option", { value: "terrain", text: "terrain" }),

        el("option", { value: "map", text: "map" }),

      ]),

    ]),

    el("div", { className: "row forge-legacy-io" }, [

      el("button", { type: "button", className: "btn", "data-voxie-project-new": "", text: "New" }),

      el("button", { type: "button", className: "btn", "data-voxie-project-open": "", text: "Open…" }),

      el("button", { type: "button", className: "btn", "data-voxie-project-save": "", text: "Save" }),

    ]),

    el("div", { className: "row forge-legacy-io" }, [

      el("button", { type: "button", className: "btn", "data-voxie-project-save-json": "", text: "Save project…" }),

    ]),

    el("label", { className: "field forge-legacy-io" }, [

      "Recent ",

      el("select", { "data-voxie-project-recent": "" }, [

        el("option", { value: "", text: "No recent files" }),

      ]),

    ]),

    el("input", {

      type: "file",

      accept: ".vxw,.vxt,.vxb,.json,.vxpj.json,application/json,application/octet-stream",

      "data-voxie-project-open-file": "",

      hidden: true,

    }),

    el("div", { className: "meta", style: "margin-top:8px" }, [

      el("span", { text: "Project" }),

      el("strong", { "data-voxie-project-name": "", text: "untitled_part" }),

      el("span", { text: "Type" }),

      el("strong", { "data-voxie-project-type-label": "", text: "part" }),

      el("span", { text: "Mode" }),

      el("strong", { "data-voxie-build-mode": "", text: "part" }),

      el("span", { text: "World size" }),

      el("strong", { "data-voxie-world-size": "", text: "—" }),

    ]),

  ]);

  return { root, bind() {}, id: "project" };

}


