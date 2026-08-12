/**
 * Canonical forge control-help lines.
 * Move/pan key labels are derived from KEYBOARD_MOVE_CODES so the bottom bar
 * and Bindings panel stay aligned when those bindings change.
 *
 * Camera wiring itself lives in camera/ + ForgeInput — this module is help text only.
 */

import { KEYBOARD_MOVE_CODES } from "../camera/keyboardMoveCodes.js";

function prettyCode(code) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Arrow")) return code.slice(5);
  return code;
}

function codesForAction(action) {
  return Object.entries(KEYBOARD_MOVE_CODES)
    .filter(([, a]) => a === action)
    .map(([code]) => code);
}

function moveKeysLabel() {
  const hasWasd = ["KeyW", "KeyA", "KeyS", "KeyD"].every((c) => KEYBOARD_MOVE_CODES[c]);
  const hasArrows = ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].every(
    (c) => KEYBOARD_MOVE_CODES[c]
  );
  if (hasWasd && hasArrows) return "WASD / arrows";
  if (hasWasd) return "WASD";
  if (hasArrows) return "arrows";
  const letters = ["forward", "left", "back", "right"]
    .flatMap((a) => codesForAction(a))
    .map(prettyCode)
    .filter((c) => c.length === 1);
  return letters.length ? letters.join("") : "WASD";
}

function panKeysLabel() {
  const left = codesForAction("panLeft").map(prettyCode)[0] || "Q";
  const right = codesForAction("panRight").map(prettyCode)[0] || "E";
  return `${left}/${right}`;
}

/**
 * @param {{ tool?: string }} [opts]
 * @returns {{ id: string, keys: string, action: string }[]}
 */
export function getControlBindings(opts = {}) {
  const base = [
    { id: "move", keys: moveKeysLabel(), action: "move" },
    { id: "pan", keys: panKeysLabel(), action: "pan" },
    { id: "orbit", keys: "Alt+LMB", action: "orbit" },
    { id: "mmbPan", keys: "MMB", action: "free pan" },
    { id: "shiftPan", keys: "Shift+RMB", action: "pan" },
  ];

  // Generate shape: scroll exclusively rerolls until LMB place or Escape.
  if (opts.tool === "generate") {
    return [
      ...base,
      { id: "stamp", keys: "LMB", action: "place stamp · exit" },
      { id: "reroll", keys: "Scroll", action: "reroll shape" },
      { id: "cancel", keys: "Esc", action: "cancel generate" },
      { id: "select", keys: "Shift+LMB", action: "select" },
      { id: "plane", keys: "MMB click", action: "cycle plane" },
    ];
  }

  // Place / erase: Minecraft-style paint + erase hold-drag.
  if (opts.tool === "place" || opts.tool === "erase") {
    return [
      ...base,
      { id: "paint", keys: "LMB", action: opts.tool === "erase" ? "erase (hold)" : "paint (hold)" },
      { id: "eraseRmb", keys: "RMB", action: "erase (hold)" },
      { id: "select", keys: "Shift+LMB", action: "select" },
      { id: "slice", keys: "Scroll", action: "slice ±1" },
      { id: "zoom", keys: "Alt+Scroll", action: "zoom" },
      { id: "plane", keys: "MMB click", action: "cycle plane" },
    ];
  }

  return [
    ...base,
    { id: "stamp", keys: "LMB", action: "stamp" },
    { id: "select", keys: "Shift+LMB", action: "select" },
    { id: "slice", keys: "Scroll", action: "slice ±1" },
    { id: "zoom", keys: "Alt+Scroll", action: "zoom" },
    { id: "plane", keys: "MMB click", action: "cycle plane" },
  ];
}

/** Compact single-line help for the bottom HUD. */
export function formatControlsHelpCompact(opts = {}) {
  return getControlBindings(opts)
    .map((b) => `${b.keys} ${b.action}`)
    .join(" · ");
}

/** Segments for structured HUD chips. */
export function formatControlsHelpSegments(opts = {}) {
  return getControlBindings(opts).map((b) => ({
    keys: b.keys,
    action: b.action,
  }));
}
