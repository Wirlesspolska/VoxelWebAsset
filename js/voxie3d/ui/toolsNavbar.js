/**
 * Second navbar — every forge tool as a button.
 * Clicking switches tool AND shows that tool's side panel.
 * Items come only from tools/registry.js.
 */

import { el } from "./panels/dom.js";
import { getToolNavItems, TOOL_NAV_ITEMS } from "../tools/registry.js";

/** @typedef {{ id: string, label: string, tool?: string|null, panel?: string }} ToolNavItem */

export { TOOL_NAV_ITEMS };

/**
 * @param {ParentNode} root
 * @param {{
 *   onSelect?: (item: ToolNavItem) => void,
 *   getActiveTool?: () => string,
 *   getActivePanel?: () => string,
 * }} [handlers]
 */
export function bindToolsNavbar(root, handlers = {}) {
  let bar = root.querySelector("[data-voxie-tools-navbar]");
  if (!bar) {
    bar = el("nav", {
      className: "forge-tools-navbar",
      "data-voxie-tools-navbar": "",
      "aria-label": "Forge tools",
    });
    const chrome = root.querySelector(".forge-chrome") || root.querySelector(".forge-top");
    if (chrome) {
      // Insert as second bar under menus — sibling after chrome
      chrome.insertAdjacentElement("afterend", bar);
    } else {
      root.insertBefore(bar, root.firstChild);
    }
  } else {
    bar.innerHTML = "";
  }

  /** @type {HTMLButtonElement[]} */
  const buttons = [];
  const items = getToolNavItems();

  for (const item of items) {
    const btn = el("button", {
      type: "button",
      className: "tools-nav-btn",
      text: item.label,
      "data-voxie-tools-nav": item.id,
      "data-panel": item.panel || item.id,
      ...(item.tool ? { "data-tool": item.tool } : {}),
    });
    btn.addEventListener("click", () => {
      handlers.onSelect?.(item);
      sync();
    });
    bar.appendChild(btn);
    buttons.push(btn);
  }

  function sync() {
    const tool = handlers.getActiveTool?.() || "";
    const panel = handlers.getActivePanel?.() || "";
    for (const btn of buttons) {
      const id = btn.dataset.voxieToolsNav;
      const t = btn.dataset.tool;
      const active =
        (t && t === tool) ||
        (!t && id === panel) ||
        (panel && btn.dataset.panel === panel);
      btn.classList.toggle("is-active", !!active);
    }
  }

  sync();

  return {
    el: bar,
    sync,
    items,
    dispose() {
      bar?.remove();
    },
  };
}
