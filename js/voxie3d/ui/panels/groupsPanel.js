import { el, section, check } from "./dom.js";

/**
 * Groups panel — start/stop recording, group-from-selection, group-by-color,
 * collective H/S/B + RGB channel apply modules.
 */
export function createGroupsPanel() {
  const hueIn = el("input", {
    type: "number",
    value: "0",
    step: "5",
    "data-voxie-group-hue": "",
    title: "Hue shift degrees",
  });
  const briIn = el("input", {
    type: "number",
    value: "0",
    step: "5",
    "data-voxie-group-bri": "",
    title: "Brightness offset",
  });
  const satIn = el("input", {
    type: "number",
    value: "0",
    step: "5",
    "data-voxie-group-sat": "",
    title: "Saturation offset",
  });
  const rIn = el("input", { type: "number", value: "0", step: "8", "data-voxie-group-ch-r": "" });
  const gIn = el("input", { type: "number", value: "0", step: "8", "data-voxie-group-ch-g": "" });
  const bIn = el("input", { type: "number", value: "0", step: "8", "data-voxie-group-ch-b": "" });
  const variety = el("input", {
    type: "checkbox",
    "data-voxie-group-variety": "",
  });
  const nearTol = el("input", {
    type: "number",
    value: "0",
    min: "0",
    max: "48",
    step: "4",
    "data-voxie-group-color-tol": "",
    title: "0 = exact hex match; higher = near-color bins",
  });

  const root = section("Groups", { panel: "groups", "data-voxie-panel": "groups" }, [
    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-group-start": "",
        text: "Start Group",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-group-stop": "",
        text: "Stop Group",
        disabled: true,
      }),
    ]),
    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-group-from-sel": "",
        text: "Group selection",
        title: "Make a group from current selection",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-group-by-color": "",
        text: "Group by color",
        title: "Cluster volume (or selection) by identical / near color",
      }),
    ]),
    el("label", { className: "field" }, ["Near tol ", nearTol]),
    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-group-recolor": "",
        text: "Recolor",
        title: "Paint current color onto selected group",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-group-shade": "",
        text: "Natural shading",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-group-texture": "",
        text: "Apply texture",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-group-gradient": "",
        text: "Gradient Y",
      }),
    ]),

    el("h3", { className: "subhead", text: "Collective channels" }),
    el("div", { className: "channel-mod", "data-module": "hue" }, [
      el("label", { className: "field" }, ["Hue Δ ", hueIn]),
      el("label", { className: "field" }, ["Sat Δ ", satIn]),
      el("label", { className: "field" }, ["Bri Δ ", briIn]),
    ]),
    el("div", { className: "channel-mod", "data-module": "rgb" }, [
      el("label", { className: "field" }, ["R Δ ", rIn]),
      el("label", { className: "field" }, ["G Δ ", gIn]),
      el("label", { className: "field" }, ["B Δ ", bIn]),
    ]),
    el("label", { className: "check" }, [
      variety,
      " Variety (slight per-voxel hue)",
    ]),
    el("button", {
      type: "button",
      className: "btn",
      "data-voxie-group-apply-channels": "",
      text: "Apply to group(s)",
    }),

    el("ul", { className: "group-list", "data-voxie-group-list": "" }),
    el("p", {
      className: "forge-tag",
      "data-voxie-group-status": "",
      text: "No active group",
    }),
  ]);

  return { root, bind() {}, sync() {}, id: "groups", kind: "tool", toolId: "groups" };
}
