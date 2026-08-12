/**
 * Shared keyboard → camera-move action map (no Three.js dependency).
 * Used by keyboardMove + bindingsHelp so HUD text tracks real bindings.
 */

/** @typedef {'forward'|'back'|'left'|'right'|'panLeft'|'panRight'} MoveAction */

export const KEYBOARD_MOVE_CODES = Object.freeze({
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyQ: "panLeft",
  KeyE: "panRight",
});
