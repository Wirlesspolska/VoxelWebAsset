/**
 * App chrome navbar for Voxie3D Forge.
 * File menu owns all IO entry points; mode badge reflects world vs asset.
 */

/**
 * @typedef {object} NavbarHandlers
 * @property {() => void} [onNewWorld]
 * @property {() => void} [onNewAsset]
 * @property {() => void} [onNewTerrain]
 * @property {() => void} [onOpen]
 * @property {() => void} [onSave]
 * @property {() => void} [onSaveProject]
 * @property {(index: number) => void} [onRecent]
 * @property {() => void} [onPreferences]
 * @property {() => void} [onPerformance]
 * @property {(id: string) => void} [onUtility]
 * @property {() => void} [onOptions]
 * @property {() => void} [onBindings]
 * @property {() => void} [onExport]
 * @property {() => void} [onExportJson]
 * @property {() => void} [onExportBinary]
 * @property {() => void} [onImport]
 * @property {() => Array<{ name: string, type: string, kind: string, pathOrKey?: string }>} [listRecent]
 */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v != null) node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function menuItem(label, action, opts = {}) {
  const btn = el("button", {
    type: "button",
    className: `nav-menu-item${opts.danger ? " is-danger" : ""}`,
    text: label,
  });
  if (opts.disabled) {
    btn.disabled = true;
    btn.classList.add("is-disabled");
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (opts.disabled) return;
    action?.();
    closeAllMenus(btn.closest("[data-voxie-navbar]"));
  });
  return btn;
}

function menuSep() {
  return el("div", { className: "nav-menu-sep", role: "separator" });
}

function closeAllMenus(root) {
  if (!root) return;
  root.querySelectorAll(".nav-dropdown.is-open").forEach((n) => n.classList.remove("is-open"));
}

/**
 * Mount / bind navbar into an existing chrome host.
 * Host may already contain `[data-voxie-navbar]`; otherwise one is created.
 *
 * @param {ParentNode} root
 * @param {NavbarHandlers} handlers
 */
export function bindNavbar(root, handlers = {}) {
  let nav = root.querySelector("[data-voxie-navbar]");
  if (!nav) {
    nav = el("nav", {
      className: "forge-navbar",
      "data-voxie-navbar": "",
      "aria-label": "Forge menus",
    });
    const chrome = root.querySelector(".forge-chrome") || root.querySelector(".forge-top");
    if (chrome) chrome.appendChild(nav);
    else root.appendChild(nav);
  } else {
    nav.innerHTML = "";
  }

  const fileDrop = el("div", { className: "nav-dropdown", "data-nav": "file" });
  const fileBtn = el("button", {
    type: "button",
    className: "nav-tab",
    text: "File",
    "aria-haspopup": "true",
  });
  const fileMenu = el("div", { className: "nav-menu", role: "menu" });

  const recentWrap = el("div", { className: "nav-submenu-wrap" });
  const recentBtn = el("button", {
    type: "button",
    className: "nav-menu-item has-sub",
    text: "Recent ▸",
  });
  const recentMenu = el("div", { className: "nav-submenu", role: "menu" });
  recentWrap.append(recentBtn, recentMenu);

  function refreshRecent() {
    recentMenu.innerHTML = "";
    const list = typeof handlers.listRecent === "function" ? handlers.listRecent() : [];
    if (!list.length) {
      recentMenu.appendChild(
        el("div", { className: "nav-menu-empty", text: "No recent files" })
      );
      return;
    }
    list.forEach((r, i) => {
      const label = `${r.name} · ${r.type}/${r.kind}`;
      recentMenu.appendChild(
        menuItem(label, () => handlers.onRecent?.(i))
      );
    });
  }

  recentBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    refreshRecent();
    recentWrap.classList.toggle("is-open");
  });

  fileMenu.append(
    el("div", { className: "nav-menu-label", text: "New" }),
    menuItem("Create World", () => handlers.onNewWorld?.()),
    menuItem("Create Asset (part)", () => handlers.onNewAsset?.()),
    menuItem("Create Terrain / Map", () => handlers.onNewTerrain?.()),
    menuSep(),
    menuItem("Open…", () => handlers.onOpen?.()),
    menuItem("Save", () => handlers.onSave?.()),
    menuItem("Save Project…", () => handlers.onSaveProject?.()),
    recentWrap,
    menuSep(),
    menuItem("Import volume…", () => handlers.onImport?.()),
    menuItem("Export…", () => handlers.onExport?.()),
    menuItem("Export JSON", () => handlers.onExportJson?.()),
    menuItem("Export binary (.vxb)", () => handlers.onExportBinary?.()),
    menuSep(),
    menuItem("Preferences…", () => handlers.onPreferences?.())
  );

  fileDrop.append(fileBtn, fileMenu);
  nav.appendChild(fileDrop);

  // Edit / Tools
  const editDrop = el("div", { className: "nav-dropdown", "data-nav": "edit" });
  const editBtn = el("button", {
    type: "button",
    className: "nav-tab",
    text: "Edit",
    "aria-haspopup": "true",
  });
  const editMenu = el("div", { className: "nav-menu", role: "menu" });
  editMenu.append(
    menuItem("Undo", () => handlers.onUndo?.(), { disabled: false }),
    menuItem("Redo", () => handlers.onRedo?.()),
    menuItem("Bend time (branch session)", () => handlers.onBendTime?.()),
    menuSep(),
    menuItem("Place", () => handlers.onTool?.("place")),
    menuItem("Erase", () => handlers.onTool?.("erase")),
    menuItem("Select", () => handlers.onTool?.("select")),
    menuItem("Shape", () => handlers.onTool?.("shape")),
    menuItem("Generate shape", () => handlers.onTool?.("generate")),
    menuItem("Stroke", () => handlers.onTool?.("stroke")),
    menuItem("Texturizer", () => handlers.onTool?.("texturizer")),
    menuSep(),
    menuItem("Deselect / clear selection", () => handlers.onTool?.("none"))
  );
  editDrop.append(editBtn, editMenu);
  nav.appendChild(editDrop);

  // View
  const viewDrop = el("div", { className: "nav-dropdown", "data-nav": "view" });
  const viewBtn = el("button", {
    type: "button",
    className: "nav-tab",
    text: "View",
    "aria-haspopup": "true",
  });
  const viewMenu = el("div", { className: "nav-menu", role: "menu" });
  const axesBtn = el("button", {
    type: "button",
    className: "nav-menu-item",
    text: "Axes: On",
    "data-voxie-axis-gizmo-btn": "",
  });
  axesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllMenus(nav);
    const visible = handlers.onToggleAxisGizmo?.();
    setAxisGizmoLabel(!!visible);
  });
  viewMenu.append(
    axesBtn,
    menuItem("Toggle grid", () => handlers.onToggleGrid?.()),
    menuSep(),
    menuItem("Project panel", () => handlers.onUtility?.("project")),
    menuItem("Volume panel", () => handlers.onUtility?.("volume")),
    menuItem("Performance…", () => handlers.onPerformance?.()),
    menuItem("Options…", () => handlers.onOptions?.()),
    menuItem("Controls / Bindings", () => handlers.onBindings?.()),
    menuSep(),
    menuItem("Dock left", () => handlers.onDockSide?.("left")),
    menuItem("Dock right", () => handlers.onDockSide?.("right")),
    menuSep(),
    menuItem("Pop out active tool", () => handlers.onPopOutActive?.()),
    menuItem("Pop out Color", () => handlers.onPopOutPanel?.("color")),
    menuItem("Dock all pop-outs", () => handlers.onDockAllPopouts?.()),
    menuSep(),
    (() => {
      const a = el("a", { className: "nav-menu-item", href: "index.html", text: "Voxie hub" });
      a.addEventListener("click", () => closeAllMenus(nav));
      return a;
    })(),
    (() => {
      const a = el("a", { className: "nav-menu-item", href: "voxel-world.html", text: "World Forge" });
      a.addEventListener("click", () => closeAllMenus(nav));
      return a;
    })()
  );
  viewDrop.append(viewBtn, viewMenu);
  nav.appendChild(viewDrop);

  // Preferences (top-level)
  const prefsBtn = el("button", {
    type: "button",
    className: "nav-tab",
    text: "Preferences",
  });
  prefsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllMenus(nav);
    handlers.onPreferences?.();
  });
  nav.appendChild(prefsBtn);

  function toggle(drop) {
    const open = drop.classList.contains("is-open");
    closeAllMenus(nav);
    if (!open) {
      if (drop.dataset.nav === "file") refreshRecent();
      drop.classList.add("is-open");
    }
  }

  fileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle(fileDrop);
  });
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle(editDrop);
  });
  viewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle(viewDrop);
  });

  const onDocClick = (e) => {
    if (!nav.contains(e.target)) closeAllMenus(nav);
  };
  const onKey = (e) => {
    if (e.key === "Escape") closeAllMenus(nav);
  };
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKey);

  // Mode badge host (created if missing)
  let badge = root.querySelector("[data-voxie-mode-badge]");
  if (!badge) {
    badge = el("div", {
      className: "forge-mode-badge",
      "data-voxie-mode-badge": "",
      text: "ASSET",
    });
    const chrome = root.querySelector(".forge-chrome") || root.querySelector(".forge-top");
    if (chrome) chrome.appendChild(badge);
  }

  /**
   * @param {'part'|'world'|string} mode
   * @param {string} [typeLabel]
   */
  function setModeBadge(mode, typeLabel) {
    const isWorld = mode === "world" || typeLabel === "world" || typeLabel === "terrain" || typeLabel === "map";
    badge.textContent = isWorld
      ? `WORLD${typeLabel && typeLabel !== "world" ? ` · ${typeLabel}` : ""}`
      : "ASSET · part";
    badge.dataset.mode = isWorld ? "world" : "part";
    badge.classList.toggle("is-world", isWorld);
    badge.classList.toggle("is-part", !isWorld);
  }

  function setAxisGizmoLabel(visible) {
    const on = !!visible;
    axesBtn.textContent = on ? "Axes: On" : "Axes: Off";
    axesBtn.classList.toggle("is-active", on);
  }

  return {
    refreshRecent,
    setModeBadge,
    setAxisGizmoLabel,
    closeMenus: () => closeAllMenus(nav),
    dispose() {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    },
  };
}

/** Top chrome map (documentation for hosts / parent agents). */
export const FILE_MENU_MAP = {
  File: ["New…", "Open…", "Save", "Save Project…", "Recent", "Import", "Export", "Export JSON", "Export binary", "Preferences…"],
  Edit: ["Undo", "Redo", "Bend time", "Place", "Erase", "Select", "Shape", "Stroke", "Texturizer", "Deselect"],
  View: ["Axes", "Grid", "Project", "Volume", "Performance…", "Options…", "Controls", "Dock left/right", "Pop out panels", "Hub / World Forge"],
  UtilityBar: ["Project", "Volume", "Performance", "Controls"],
  Preferences: ["Modal"],
};
