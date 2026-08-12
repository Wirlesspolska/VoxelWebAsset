import { el, section } from "./dom.js";

/** Undo / Redo / Bend time — compact history strip + panel. */
export function createHistoryPanel() {
  const status = el("p", {
    className: "forge-tag",
    "data-voxie-history-status": "",
    text: "No edits yet",
  });

  const root = section("History", { panel: "history", "data-voxie-panel": "history" }, [
    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-undo": "",
        text: "Undo",
        title: "Ctrl+Z",
        disabled: true,
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-redo": "",
        text: "Redo",
        title: "Ctrl+Y / Ctrl+Shift+Z",
        disabled: true,
      }),
    ]),
    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-bend-time": "",
        text: "Bend time",
        title: "Branch a new session from the current state",
      }),
    ]),
    status,
  ]);

  function sync(voxie) {
    const st = voxie.getHistoryState?.() || {};
    const undoBtn = root.querySelector("[data-voxie-undo]");
    const redoBtn = root.querySelector("[data-voxie-redo]");
    if (undoBtn) undoBtn.disabled = !st.canUndo;
    if (redoBtn) redoBtn.disabled = !st.canRedo;
    status.textContent = st.canUndo || st.canRedo
      ? `Undo ${st.undoLen || 0} · Redo ${st.redoLen || 0}`
      : "No edits yet";
  }

  function bind(voxie) {
    // Clicks wired once in bindForgeHud (undo/redo/bend); panel only syncs labels.
    voxie.on?.("historyChange", () => sync(voxie));
    sync(voxie);
  }

  return { root, bind, sync, id: "history", kind: "pinned" };
}

/** Tiny strip for chrome (optional). */
export function createHistoryStrip() {
  return el("div", { className: "history-strip", "data-voxie-history-strip": "" }, [
    el("button", { type: "button", className: "btn", "data-voxie-undo": "", text: "↶", title: "Undo" }),
    el("button", { type: "button", className: "btn", "data-voxie-redo": "", text: "↷", title: "Redo" }),
    el("button", {
      type: "button",
      className: "btn",
      "data-voxie-bend-time": "",
      text: "Bend",
      title: "Bend time — branch session",
    }),
  ]);
}
