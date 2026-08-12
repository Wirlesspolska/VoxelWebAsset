import { el, section, check } from "./dom.js";
import { createBrushPanel } from "./brushPanel.js";

/** Place tool context — brush + snap + paint drag. */
export function createPlacePanel() {
  const brush = createBrushPanel();
  const snapRow = el("div", { className: "row" }, [
    el("button", {
      type: "button",
      className: "btn is-active",
      "data-voxie-snap": "block",
      text: "Block",
    }),
    el("button", {
      type: "button",
      className: "btn",
      "data-voxie-snap": "free",
      text: "Free",
    }),
  ]);

  const root = section("Place", { panel: "place", "data-voxie-panel": "place" }, [
    el("p", {
      className: "forge-tag",
      text: "LMB paint (hold-drag) · RMB erase · Alt+LMB orbit",
    }),
    check("Paint drag", {
      "data-voxie-paint-drag": "",
      title: "Legacy pref — Place/Erase already hold-stream without this",
    }),
    el("h3", { className: "subhead", text: "Snap" }),
    snapRow,
    brush.root,
  ]);

  function bind(voxie, syncMeta) {
    brush.bind?.(voxie, syncMeta);
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
    const paint = root.querySelector("[data-voxie-paint-drag]");
    paint?.addEventListener("change", () => {
      voxie.setPaintDrag?.(!!paint.checked);
    });
    if (paint) paint.checked = !!voxie.getPaintDrag?.();
    const mode = voxie.getState?.()?.snapMode === "free" ? "free" : "block";
    root.querySelectorAll("[data-voxie-snap]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.voxieSnap === mode);
    });
  }

  function sync(voxie) {
    brush.sync?.(voxie);
    const paint = root.querySelector("[data-voxie-paint-drag]");
    if (paint) paint.checked = !!voxie.getPaintDrag?.();
  }

  return { root, bind, sync, id: "place", kind: "tool", toolId: "place" };
}
