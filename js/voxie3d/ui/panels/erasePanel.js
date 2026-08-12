import { el, section, check } from "./dom.js";
import { createBrushPanel } from "./brushPanel.js";

/** Erase tool context. */
export function createErasePanel() {
  const brush = createBrushPanel();
  const root = section("Erase", { panel: "erase", "data-voxie-panel": "erase" }, [
    el("p", {
      className: "forge-tag",
      text: "LMB / RMB erase (hold-drag) · Alt+LMB orbit · Delete clears selection",
    }),
    check("Paint drag", {
      "data-voxie-paint-drag": "",
      title: "Legacy pref — Place/Erase already hold-stream without this",
    }),
    brush.root,
  ]);

  function bind(voxie, syncMeta) {
    brush.bind?.(voxie, syncMeta);
    const paint = root.querySelector("[data-voxie-paint-drag]");
    paint?.addEventListener("change", () => {
      voxie.setPaintDrag?.(!!paint.checked);
    });
    if (paint) paint.checked = !!voxie.getPaintDrag?.();
  }

  function sync(voxie) {
    brush.sync?.(voxie);
  }

  return { root, bind, sync, id: "erase", kind: "tool", toolId: "erase" };
}
