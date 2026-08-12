/**
 * Slim left dock — Color (pinned) + active tool panel only.
 *
 * Utilities (Project / Volume / Performance / Controls) live in utilityLayer.js
 * and open from the utility navbar — not stacked here.
 *
 * Tool panels are built from tools/registry.js. All tool panels stay mounted
 * (hidden when inactive) so one-shot HUD binders can wire every data-voxie-* control.
 */

import { el } from "./panels/dom.js";
import { createColorPickerPanel } from "./panels/colorPickerPanel.js";
import { createHistoryPanel } from "./panels/historyPanel.js";
import { createPlacePanel } from "./panels/placePanel.js";
import { createErasePanel } from "./panels/erasePanel.js";
import { createSelectionPanel } from "./panels/selectionPanel.js";
import { createShapesPanel } from "./panels/shapesPanel.js";
import { createGeneratePanel } from "./panels/generatePanel.js";
import { createStrokePanel } from "./panels/strokePanel.js";
import { createTexturizerPanel } from "./panels/texturizerPanel.js";
import { createGroupsPanel } from "./panels/groupsPanel.js";
import { createBrushPanel } from "./panels/brushPanel.js";
import { attachPopoutButton } from "./panelPopout.js";
import { buildUtilityPanels } from "./utilityLayer.js";
import { TOOL_REGISTRY } from "../tools/registry.js";

/** @typedef {{ root: HTMLElement, bind?: Function, sync?: Function, id: string, kind?: string, toolId?: string }} DockPanel */

/** Panel factories keyed by registry `panel` id — only source for dock tool panels. */
const PANEL_FACTORIES = {
  place: createPlacePanel,
  erase: createErasePanel,
  select: createSelectionPanel,
  shape: createShapesPanel,
  generate: createGeneratePanel,
  stroke: createStrokePanel,
  texturizer: createTexturizerPanel,
  groups: createGroupsPanel,
  brush: createBrushPanel,
  history: createHistoryPanel,
};

/**
 * Tool panel map — ids/order from registry; factories from PANEL_FACTORIES.
 */
export function buildToolPanels() {
  /** @type {Record<string, DockPanel>} */
  const toolPanels = {};
  for (const def of TOOL_REGISTRY) {
    const factory = PANEL_FACTORIES[def.panel];
    if (!factory) {
      console.warn("[Voxie3D] missing panel factory for registry entry", def.panel);
      continue;
    }
    const panel = factory();
    panel.id = def.panel;
    panel.kind = panel.kind || "tool";
    panel.toolId = def.activatesTool || def.id;
    panel.root?.setAttribute?.("data-voxie-panel", def.panel);
    toolPanels[def.panel] = panel;
  }
  return toolPanels;
}


export function buildPinnedPanels() {
  const color = createColorPickerPanel();
  color.root.setAttribute("data-voxie-panel", "color");
  color.kind = "pinned";
  return [color];
}

/** @deprecated utilities moved to utilityLayer — kept for index re-exports */
export function buildSharedPanels() {
  return Object.values(buildUtilityPanels()).filter((p) => p.id !== "history");
}

/** @deprecated use buildPinned + tool — kept for index re-exports */
export function buildForgePanels(mode = "part") {
  void mode;
  return [...buildPinnedPanels(), ...Object.values(buildToolPanels()), ...buildSharedPanels()];
}

/**
 * Apply dock side class on app shell.
 * @param {ParentNode} root
 * @param {'left'|'right'} side
 */
export function applyDockSide(root, side) {
  const app =
    root.querySelector?.(".forge-app") ||
    (root.classList?.contains("forge-app") ? root : document.querySelector(".forge-app"));
  if (!app) return side;
  const next = side === "right" ? "right" : "left";
  app.classList.remove("side-dock-left", "side-dock-right");
  app.classList.add(next === "right" ? "side-dock-right" : "side-dock-left");
  app.dataset.dockSide = next;
  const host =
    root.querySelector?.("[data-voxie-side-panel]") || root.querySelector?.(".forge-side");
  if (host) {
    host.dataset.dockSide = next;
    host.classList.toggle("dock-right", next === "right");
    host.classList.toggle("dock-left", next === "left");
  }
  return next;
}

/**
 * Compact plane / slice / tool readout (not a full Layers wall).
 */
function buildDockStatus() {
  return el("div", { className: "dock-status", "data-voxie-dock-status": "" }, [
    el("span", { className: "dock-status-item" }, [
      el("span", { className: "dock-status-label", text: "Plane" }),
      el("strong", { "data-voxie-axis": "", text: "Z" }),
    ]),
    el("span", { className: "dock-status-item" }, [
      el("span", { className: "dock-status-label", text: "Slice" }),
      el("strong", { "data-voxie-slice": "", text: "0" }),
    ]),
    el("span", { className: "dock-status-item" }, [
      el("span", { className: "dock-status-label", text: "Tool" }),
      el("strong", { "data-voxie-tool-label": "", text: "place" }),
    ]),
  ]);
}

/**
 * @param {ParentNode} root
 * @param {object} voxie
 * @param {{
 *   mode?: 'part'|'world',
 *   syncMeta?: Function,
 *   dockSide?: 'left'|'right',
 *   activePanel?: string,
   *   popoutManager?: object,
   * }} [opts]
 */
export function mountLeftDock(root, voxie, opts = {}) {
  let host =
    root.querySelector?.("[data-voxie-side-panel]") || root.querySelector?.(".forge-side");
  if (!host) {
    host = document.createElement("aside");
    host.className = "forge-side";
    host.setAttribute("data-voxie-side-panel", "");
    const app = root.querySelector?.(".forge-app") || root;
    const stage = root.querySelector?.(".forge-stage");
    if (stage) app.insertBefore(host, stage);
    else app.appendChild(host);
  }

  host.innerHTML = "";
  host.setAttribute("data-voxie-dock", "modular");
  host.classList.add("side-panel", "dock-slim");

  applyDockSide(root, opts.dockSide || "left");

  const pinned = buildPinnedPanels();
  const toolPanels = buildToolPanels();

  let activePanelId = opts.activePanel || voxie.getTool?.() || "place";
  if (!toolPanels[activePanelId]) activePanelId = "place";

  const pinnedHost = el("div", {
    className: "dock-pinned",
    "data-voxie-dock-pinned": "",
  });
  const toolHost = el("div", {
    className: "dock-tool-slot",
    "data-voxie-dock-tool": "",
  });
  const status = buildDockStatus();

  host.append(pinnedHost, status, toolHost);

  for (const p of pinned) {
    pinnedHost.appendChild(p.root);
  }

  function showToolPanel(id) {
    const nextId = toolPanels[id] ? id : "place";
    activePanelId = nextId;
    // Keep every panel mounted so bindForgeHud / bindForgePanel querySelectors
    // can attach once. Detaching inactive panels left Groups/Shapes/etc. dead.
    for (const [pid, panel] of Object.entries(toolPanels)) {
      if (!panel?.root) continue;
      if (panel.root.parentElement !== toolHost) toolHost.appendChild(panel.root);
      const on = pid === nextId;
      panel.root.hidden = !on;
      panel.root.classList.toggle("is-dock-active", on);
      panel.root.classList.toggle("is-dock-hidden", !on);
      if (on) {
        panel.root.classList.remove("is-collapsed");
        panel.root.removeAttribute("data-collapsed");
      }
    }
    host.dataset.activeToolPanel = nextId;
    return nextId;
  }

  showToolPanel(activePanelId);

  const allPanels = [...pinned, ...Object.values(toolPanels)];
  const seen = new Set();
  for (const p of allPanels) {
    if (seen.has(p.root)) continue;
    seen.add(p.root);
    try {
      p.bind?.(voxie, opts.syncMeta);
    } catch (err) {
      console.warn("[Voxie3D] panel bind failed", p.id, err);
    }
  }

  const popout = opts.popoutManager || null;
  const popoutIds = ["color", "history", "groups", "place", "select", "brush"];
  if (popout) {
    for (const id of popoutIds) {
      const panel = toolPanels[id] || pinned.find((p) => p.id === id);
      if (panel) attachPopoutButton(panel.root, id, popout);
    }
  }

  return {
    host,
    pinned,
    toolPanels,
    shared: [],
    panels: allPanels,
    getActivePanelId: () => activePanelId,
    setActivePanel: (id) => showToolPanel(id),
    setDockSide: (side) => applyDockSide(root, side),
    getPanel(id) {
      return toolPanels[id] || pinned.find((p) => p.id === id) || null;
    },
    getPanelRoot(id) {
      return this.getPanel(id)?.root || host.querySelector(`[data-voxie-panel="${id}"]`);
    },
    sync() {
      for (const p of allPanels) p.sync?.(voxie);
    },
  };
}
