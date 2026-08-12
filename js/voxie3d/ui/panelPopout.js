/**
 * Pop-out windows for Voxie forge panels (dual-monitor).
 *
 * Sync: BroadcastChannel `voxie3d.panel-sync` + postMessage fallback.
 * Main window owns the controller; pop-outs mirror UI and forward actions.
 */

import { el } from "./panels/dom.js";

export const POPOUT_CHANNEL = "voxie3d.panel-sync";
export const POPOUT_PREFS_KEY = "voxie3d.popouts";
export const POPOUT_STYLESHEET = "css/voxel-forge.css";

/**
 * @typedef {'color'|'history'|'groups'|'project'|'place'|'erase'|'select'|'shape'|'stroke'|'texturizer'|'brush'|'browser'|'layers'|'options'|'volume'|'bindings'} PopoutPanelId
 */

const PANEL_TITLES = {
  color: "Color",
  history: "History",
  groups: "Groups",
  project: "Project",
  place: "Place",
  erase: "Erase",
  select: "Select",
  shape: "Shapes",
  generate: "Generate shape",
  stroke: "Stroke",
  texturizer: "Texturizer",
  brush: "Brush",
  browser: "Browser",
  layers: "Layers",
  options: "Options",
  volume: "Volume",
  bindings: "Bindings",
};

function loadPopoutPrefs() {
  try {
    const raw = localStorage.getItem(POPOUT_PREFS_KEY);
    if (!raw) return { out: [] };
    const doc = JSON.parse(raw);
    return { out: Array.isArray(doc.out) ? doc.out.map(String) : [] };
  } catch {
    return { out: [] };
  }
}

function savePopoutPrefs(ids) {
  try {
    localStorage.setItem(POPOUT_PREFS_KEY, JSON.stringify({ out: [...ids] }));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {object} opts
 * @param {ParentNode} opts.root main document root
 * @param {(id: string) => HTMLElement|null} opts.getPanelRoot
 * @param {(msg: object) => void} [opts.onMessage] from pop-out → main
 * @param {string} [opts.stylesheetHref]
 */
export function createPanelPopoutManager(opts) {
  const root = opts.root || document;
  const getPanelRoot = opts.getPanelRoot;
  const stylesheetHref = opts.stylesheetHref || POPOUT_STYLESHEET;
  /** @type {Map<string, Window>} */
  const windows = new Map();
  /** @type {Map<string, HTMLElement>} placeholders in dock */
  const placeholders = new Map();
  let channel = null;
  try {
    channel = new BroadcastChannel(POPOUT_CHANNEL);
  } catch {
    channel = null;
  }

  function broadcast(msg) {
    const payload = { ...msg, source: "main", t: Date.now() };
    try {
      channel?.postMessage(payload);
    } catch {
      /* ignore */
    }
    for (const [, win] of windows) {
      try {
        win.postMessage({ channel: POPOUT_CHANNEL, ...payload }, location.origin);
      } catch {
        /* ignore */
      }
    }
  }

  function isOut(id) {
    return windows.has(id) && !windows.get(id)?.closed;
  }

  function listOut() {
    return [...windows.keys()].filter((id) => isOut(id));
  }

  function persist() {
    savePopoutPrefs(listOut());
  }

  function dockBack(id) {
    const win = windows.get(id);
    const panel = getPanelRoot?.(id);
    const ph = placeholders.get(id);
    if (ph?.parentNode && panel) {
      ph.parentNode.replaceChild(panel, ph);
    }
    placeholders.delete(id);
    windows.delete(id);
    if (win && !win.closed) {
      try {
        win.close();
      } catch {
        /* ignore */
      }
    }
    persist();
    broadcast({ type: "docked", panelId: id });
    return true;
  }

  /**
   * Move panel DOM into a secondary window.
   * @param {string} id
   */
  function popOut(id) {
    const panel = getPanelRoot?.(id);
    if (!panel) return null;
    if (isOut(id)) {
      try {
        windows.get(id)?.focus();
      } catch {
        /* ignore */
      }
      return windows.get(id);
    }

    const title = PANEL_TITLES[id] || id;
    const features = "popup=yes,width=360,height=640,menubar=no,toolbar=no,location=no,status=no";
    const win = window.open("", `voxie-panel-${id}`, features);
    if (!win) {
      console.warn("[Voxie3D] pop-out blocked — allow popups for this origin");
      return null;
    }

    const ph = el("div", {
      className: "forge-panel-placeholder",
      "data-voxie-popout-ph": id,
    });
    ph.appendChild(
      el("p", {
        className: "forge-tag",
        text: `${title} — popped out`,
      })
    );
    const dockBtn = el("button", {
      type: "button",
      className: "btn",
      text: "Dock back",
    });
    dockBtn.addEventListener("click", () => dockBack(id));
    ph.appendChild(dockBtn);
    panel.parentNode?.replaceChild(ph, panel);
    placeholders.set(id, ph);

    const doc = win.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Voxie — ${title}</title>
<link rel="stylesheet" href="${stylesheetHref}"/>
<style>
  body{margin:0;padding:12px;background:var(--bg0,#121510);color:var(--ink,#e8e4d4);}
  .popout-bar{display:flex;gap:8px;align-items:center;margin-bottom:10px;}
  .popout-bar h1{margin:0;font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#8a9078);}
</style></head><body>
<div class="popout-bar"><h1>${title}</h1>
<button type="button" class="btn" id="dock-back">Dock back</button></div>
<div id="host"></div>
</body></html>`);
    doc.close();

    const host = doc.getElementById("host");
    host?.appendChild(panel);
    doc.getElementById("dock-back")?.addEventListener("click", () => {
      dockBack(id);
    });

    windows.set(id, win);
    persist();

    const onClosePoll = setInterval(() => {
      if (win.closed) {
        clearInterval(onClosePoll);
        if (windows.get(id) === win) dockBack(id);
      }
    }, 400);

    win.addEventListener("message", (ev) => {
      if (ev.origin !== location.origin) return;
      const data = ev.data;
      if (!data || data.channel !== POPOUT_CHANNEL) return;
      opts.onMessage?.(data);
    });

    broadcast({ type: "popped", panelId: id });
    return win;
  }

  function toggle(id) {
    return isOut(id) ? dockBack(id) : popOut(id);
  }

  /** Best-effort restore from prefs (often blocked without user gesture). */
  function tryRestore() {
    const prefs = loadPopoutPrefs();
    return prefs.out;
  }

  function dispose() {
    for (const id of [...windows.keys()]) dockBack(id);
    try {
      channel?.close();
    } catch {
      /* ignore */
    }
  }

  if (channel) {
    channel.onmessage = (ev) => {
      const data = ev.data;
      if (!data || data.source === "main") return;
      opts.onMessage?.(data);
    };
  }

  return {
    popOut,
    dockBack,
    toggle,
    isOut,
    listOut,
    broadcast,
    tryRestore,
    persist,
    dispose,
    PANEL_TITLES,
  };
}

/**
 * Add Pop out / Dock back control to a panel header.
 * @param {HTMLElement} panelRoot
 * @param {string} panelId
 * @param {ReturnType<typeof createPanelPopoutManager>} manager
 */
export function attachPopoutButton(panelRoot, panelId, manager) {
  if (!panelRoot || !manager) return null;
  const h2 = panelRoot.querySelector(":scope > h2");
  if (!h2) return null;
  if (panelRoot.querySelector("[data-voxie-popout-btn]")) return null;

  let bar = panelRoot.querySelector(":scope > .panel-head");
  if (!bar) {
    bar = el("div", { className: "panel-head" });
    h2.replaceWith(bar);
    bar.appendChild(h2);
  }
  const btn = el("button", {
    type: "button",
    className: "btn btn-popout",
    "data-voxie-popout-btn": panelId,
    text: "Pop out",
    title: "Open panel in a second window",
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    manager.toggle(panelId);
    btn.textContent = manager.isOut(panelId) ? "Dock back" : "Pop out";
  });
  bar.appendChild(btn);

  const syncLabel = () => {
    btn.textContent = manager.isOut(panelId) ? "Dock back" : "Pop out";
  };
  return { btn, syncLabel };
}
