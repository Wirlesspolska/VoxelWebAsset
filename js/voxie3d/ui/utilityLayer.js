/**
 * Navbar-bound utility panels — Project / Volume / Performance / Controls.
 * Open as floating drawers (or bottom sheet for bindings). Not left-dock stack.
 */

import { el } from "./panels/dom.js";
import { createProjectPanel } from "./panels/projectPanel.js";
import { createVolumePanel } from "./panels/volumePanel.js";
import { createPerformancePanel } from "./panels/performancePanel.js";
import { createBindingsPanel } from "./panels/bindingsPanel.js";
import { createOptionsPanel } from "./panels/optionsPanel.js";
import { createBrowserPanel } from "./panels/browserPanel.js";
import { createWorldBoundsPanel } from "./panels/worldBoundsPanel.js";
import { createLayersPanel } from "./panels/layersPanel.js";

/** @typedef {{ id: string, label: string, placement?: 'float'|'sheet' }} UtilityDef */

export const UTILITY_DEFS = [
  { id: "project", label: "Project", placement: "float" },
  { id: "volume", label: "Volume", placement: "float" },
  { id: "performance", label: "Performance", placement: "float" },
  { id: "bindings", label: "Controls", placement: "sheet" },
];

/** Extra utilities (View menu / internal) — mounted but not primary bar toggles. */
const EXTRA_UTILITY_IDS = ["options", "browser", "world-bounds", "layers"];

/**
 * Build utility panel instances (single copies for HUD binders).
 */
export function buildUtilityPanels() {
  /** @type {Record<string, { root: HTMLElement, bind?: Function, sync?: Function, id: string, focus?: Function }>} */
  const map = {
    project: createProjectPanel(),
    volume: createVolumePanel(),
    performance: createPerformancePanel(),
    bindings: createBindingsPanel(),
    options: createOptionsPanel(),
    browser: createBrowserPanel(),
    "world-bounds": createWorldBoundsPanel(),
    layers: createLayersPanel(),
  };
  for (const [id, p] of Object.entries(map)) {
    p.root.setAttribute("data-voxie-panel", id);
    p.root.setAttribute("data-utility-panel", id);
    p.kind = "utility";
  }
  return map;
}

/**
 * @param {ParentNode} root
 * @param {object} voxie
 * @param {{ syncMeta?: Function, panels?: ReturnType<typeof buildUtilityPanels> }} [opts]
 */
export function mountUtilityLayer(root, voxie, opts = {}) {
  const app =
    root.querySelector?.(".forge-app") ||
    (root.classList?.contains("forge-app") ? root : document.querySelector(".forge-app"));
  const hostRoot = app || root;

  let layer = hostRoot.querySelector?.("[data-voxie-utility-layer]");
  if (!layer) {
    layer = el("div", {
      className: "forge-utility-layer",
      "data-voxie-utility-layer": "",
    });
    hostRoot.appendChild(layer);
  } else {
    layer.innerHTML = "";
  }

  const floatHost = el("div", {
    className: "utility-float-host",
    "data-voxie-utility-float": "",
    hidden: true,
  });
  const sheetHost = el("div", {
    className: "utility-sheet-host",
    "data-voxie-utility-sheet": "",
    hidden: true,
  });
  const sheetBackdrop = el("div", {
    className: "utility-sheet-backdrop",
    "data-voxie-utility-sheet-backdrop": "",
  });
  const stash = el("div", {
    className: "utility-panel-stash",
    "data-voxie-utility-stash": "",
    hidden: true,
  });
  layer.append(floatHost, sheetBackdrop, sheetHost, stash);

  const panels = opts.panels || buildUtilityPanels();
  /** @type {Map<string, HTMLElement>} */
  const homes = new Map();

  for (const p of Object.values(panels)) {
    stash.appendChild(p.root);
    homes.set(p.id, stash);
    p.root.classList.remove("is-collapsed");
    p.root.removeAttribute("data-collapsed");
  }

  /** @type {string|null} */
  let openId = null;

  function placementFor(id) {
    const def = UTILITY_DEFS.find((d) => d.id === id);
    return def?.placement === "sheet" ? "sheet" : "float";
  }

  function close() {
    if (!openId) return null;
    const panel = panels[openId];
    if (panel?.root) {
      stash.appendChild(panel.root);
    }
    floatHost.hidden = true;
    floatHost.innerHTML = "";
    sheetHost.hidden = true;
    sheetHost.innerHTML = "";
    sheetBackdrop.classList.remove("is-open");
    layer.classList.remove("has-open");
    layer.dataset.openUtility = "";
    const prev = openId;
    openId = null;
    syncBar();
    return prev;
  }

  function open(id) {
    const panel = panels[id];
    if (!panel) return null;
    if (openId === id) {
      close();
      return null;
    }
    close();
    openId = id;
    const place = placementFor(id);
    const title =
      UTILITY_DEFS.find((d) => d.id === id)?.label ||
      panel.root.querySelector("h2")?.textContent ||
      id;
    const head = el("div", { className: "utility-drawer-head" }, [
      el("h2", { text: title }),
      el("button", {
        type: "button",
        className: "btn utility-drawer-close",
        text: "Close",
        "data-utility-close": "",
      }),
    ]);
    head.querySelector("[data-utility-close]")?.addEventListener("click", () => close());

    const wrap = el("div", { className: "utility-drawer-body" });
    panel.root.classList.add("utility-panel-body");
    wrap.appendChild(panel.root);

    if (place === "sheet") {
      sheetHost.innerHTML = "";
      sheetHost.append(head, wrap);
      sheetHost.hidden = false;
      sheetBackdrop.classList.add("is-open");
    } else {
      floatHost.innerHTML = "";
      floatHost.append(head, wrap);
      floatHost.hidden = false;
    }
    layer.classList.add("has-open");
    layer.dataset.openUtility = id;
    panel.focus?.();
    syncBar();
    return id;
  }

  function toggle(id) {
    return openId === id ? (close(), null) : open(id);
  }

  function isOpen(id) {
    return openId === id;
  }

  // --- Utility toggle bar (third chrome row under tools, or beside tools) ---
  let bar = hostRoot.querySelector?.("[data-voxie-utility-bar]");
  if (!bar) {
    bar = el("nav", {
      className: "forge-utility-bar",
      "data-voxie-utility-bar": "",
      "aria-label": "Forge utilities",
    });
    const tools = hostRoot.querySelector?.("[data-voxie-tools-navbar]");
    const chrome = hostRoot.querySelector?.(".forge-chrome") || hostRoot.querySelector?.(".forge-top");
    if (tools) tools.insertAdjacentElement("afterend", bar);
    else if (chrome) chrome.insertAdjacentElement("afterend", bar);
    else hostRoot.insertBefore(bar, hostRoot.firstChild);
  } else {
    bar.innerHTML = "";
  }

  /** @type {HTMLButtonElement[]} */
  const buttons = [];
  for (const def of UTILITY_DEFS) {
    const btn = el("button", {
      type: "button",
      className: "utility-nav-btn",
      text: def.label,
      "data-voxie-utility-nav": def.id,
      title: `Show ${def.label}`,
    });
    btn.addEventListener("click", () => toggle(def.id));
    bar.appendChild(btn);
    buttons.push(btn);
  }

  function syncBar() {
    for (const btn of buttons) {
      btn.classList.toggle("is-active", btn.dataset.voxieUtilityNav === openId);
    }
  }

  sheetBackdrop.addEventListener("click", () => close());

  const onKey = (e) => {
    if (e.key === "Escape" && openId) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey);

  // Bind all utility panels once
  for (const p of Object.values(panels)) {
    try {
      p.bind?.(voxie, opts.syncMeta);
    } catch (err) {
      console.warn("[Voxie3D] utility panel bind failed", p.id, err);
    }
  }

  return {
    layer,
    bar,
    panels,
    open,
    close,
    toggle,
    isOpen: () => openId,
    getPanel(id) {
      return panels[id] || null;
    },
    getPanelRoot(id) {
      return panels[id]?.root || null;
    },
    sync() {
      for (const p of Object.values(panels)) p.sync?.(voxie);
    },
    dispose() {
      document.removeEventListener("keydown", onKey);
      close();
    },
    /** @deprecated extras listed for hosts */
    extraIds: EXTRA_UTILITY_IDS,
  };
}
