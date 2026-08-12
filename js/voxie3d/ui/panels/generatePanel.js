/**
 * Generate shape tool panel — category stamps + size/seed/density/foundation.
 */

import { el, section } from "./dom.js";
import { shapeGenCategories, SHAPE_GEN_BY_ID } from "../../generate/catalog.js";
import { SIZE_MAX, SIZE_MIN } from "../../generate/util.js";

export function createGeneratePanel() {
  const categories = shapeGenCategories();
  const shapeRows = categories.map(({ category, items }) =>
    el("div", { className: "forge-gen-cat" }, [
      el("h3", { className: "subhead", text: category }),
      el(
        "div",
        { className: "row wrap" },
        items.map((item, i) =>
          el("button", {
            type: "button",
            className: `btn${category === "Nature" && i === 0 ? " is-active" : ""}`,
            "data-voxie-gen-shape": item.id,
            text: item.label,
          })
        )
      ),
    ])
  );

  const foundationRow = el(
    "label",
    { className: "field", "data-voxie-gen-foundation-row": "" },
    [
      "Foundation depth ",
      el("input", {
        type: "number",
        min: "1",
        max: "6",
        value: "2",
        step: "1",
        "data-voxie-gen-foundation": "",
      }),
    ]
  );

  const root = section(
    "Generate shape",
    { panel: "generate", "data-voxie-panel": "generate" },
    [
      el("p", {
        className: "forge-tag",
        text: "Scroll = reroll only (slice/zoom off) · LMB place & exit · Esc cancel",
      }),
      el("label", { className: "field" }, [
        "Shape ",
        el("select", { "data-voxie-gen-select": "" }),
      ]),
      ...shapeRows,
      el("label", { className: "field" }, [
        "Size ",
        el("input", {
          type: "number",
          min: String(SIZE_MIN),
          max: String(SIZE_MAX),
          value: "6",
          step: "1",
          "data-voxie-gen-size": "",
        }),
      ]),
      el("label", { className: "field" }, [
        "Seed ",
        el("input", {
          type: "number",
          min: "1",
          value: "1",
          step: "1",
          "data-voxie-gen-seed": "",
        }),
        " ",
        el("button", {
          type: "button",
          className: "btn",
          "data-voxie-gen-reroll": "",
          text: "Reroll",
        }),
      ]),
      el("label", { className: "field" }, [
        "Density ",
        el("input", {
          type: "number",
          min: "1",
          max: "100",
          value: "70",
          step: "1",
          "data-voxie-gen-density": "",
        }),
      ]),
      foundationRow,
    ]
  );

  function syncActive(typeId) {
    root.querySelectorAll("[data-voxie-gen-shape]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.voxieGenShape === typeId);
    });
    const sel = root.querySelector("[data-voxie-gen-select]");
    if (sel && typeId) sel.value = typeId;
    const entry = SHAPE_GEN_BY_ID[typeId];
    const row = root.querySelector("[data-voxie-gen-foundation-row]");
    if (row) row.style.display = entry?.usesFoundation ? "" : "none";
  }

  function syncFromVoxie(voxie) {
    const p = voxie.getShapeGenParams?.() || voxie.shapeGen?.getParams?.();
    if (!p) return;
    const sizeEl = root.querySelector("[data-voxie-gen-size]");
    const seedEl = root.querySelector("[data-voxie-gen-seed]");
    const densEl = root.querySelector("[data-voxie-gen-density]");
    const foundEl = root.querySelector("[data-voxie-gen-foundation]");
    if (sizeEl) sizeEl.value = String(p.size);
    if (seedEl) seedEl.value = String(p.seed);
    if (densEl) densEl.value = String(p.density);
    if (foundEl) foundEl.value = String(p.foundationDepth);
    syncActive(p.type);
  }

  function bind(voxie, syncMeta) {
    const applyType = (id) => {
      voxie.setShapeGenType?.(id);
      voxie.setTool?.("generate");
      syncActive(id);
      syncFromVoxie(voxie);
      syncMeta?.();
    };

    root.querySelectorAll("[data-voxie-gen-shape]").forEach((btn) => {
      btn.addEventListener("click", () => applyType(btn.dataset.voxieGenShape));
    });

    const sel = root.querySelector("[data-voxie-gen-select]");
    if (sel) {
      sel.innerHTML = "";
      for (const { category, items } of categories) {
        const group = document.createElement("optgroup");
        group.label = category;
        for (const it of items) {
          const opt = document.createElement("option");
          opt.value = it.id;
          opt.textContent = it.label;
          group.appendChild(opt);
        }
        sel.appendChild(group);
      }
      sel.addEventListener("change", () => applyType(sel.value));
    }

    const pushParams = () => {
      voxie.setShapeGenParams?.({
        size: Number(root.querySelector("[data-voxie-gen-size]")?.value || 6),
        seed: Number(root.querySelector("[data-voxie-gen-seed]")?.value || 1),
        density: Number(root.querySelector("[data-voxie-gen-density]")?.value || 70),
        foundationDepth: Number(
          root.querySelector("[data-voxie-gen-foundation]")?.value || 2
        ),
      });
      voxie.setTool?.("generate");
      syncFromVoxie(voxie);
      syncMeta?.();
    };

    for (const attr of [
      "data-voxie-gen-size",
      "data-voxie-gen-seed",
      "data-voxie-gen-density",
      "data-voxie-gen-foundation",
    ]) {
      const inp = root.querySelector(`[${attr}]`);
      inp?.addEventListener("change", pushParams);
      if (attr !== "data-voxie-gen-seed") {
        inp?.addEventListener("input", pushParams);
      }
    }

    root.querySelector("[data-voxie-gen-reroll]")?.addEventListener("click", () => {
      voxie.rerollShapeGen?.();
      voxie.setTool?.("generate");
      syncFromVoxie(voxie);
      syncMeta?.();
    });

    voxie.on?.("shapeGenChange", () => {
      syncFromVoxie(voxie);
      syncMeta?.();
    });

    syncFromVoxie(voxie);
  }

  return {
    root,
    bind,
    sync: syncFromVoxie,
    id: "generate",
    kind: "tool",
    toolId: "generate",
  };
}
