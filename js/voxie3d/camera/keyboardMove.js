import * as THREE from "three";
import { KEYBOARD_MOVE_CODES } from "./keyboardMoveCodes.js";

/**
 * Modular keyboard camera-move state for the forge orbit controller.
 *
 * Bindings (handled by ForgeInput → setKey):
 *   W / ↑  forward along look (horizontal)
 *   S / ↓  back
 *   A / ←  strafe left
 *   D / →  strafe right
 *   Q      pan left  (along camera right)
 *   E      pan right (along camera right)
 *
 * Movement translates pivot + camera together (orbit radius preserved).
 */

/** @typedef {'forward'|'back'|'left'|'right'|'panLeft'|'panRight'} MoveAction */

export { KEYBOARD_MOVE_CODES };

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _delta = new THREE.Vector3();

/**
 * @param {object} [opts]
 * @param {number} [opts.moveSpeed] world units per second (continuous mode)
 * @param {boolean} [opts.gridSnap] when true, step by cell size with hold-repeat
 * @param {number} [opts.cellSize]
 * @param {number} [opts.snapRepeatHz] grid-snap steps per second while held
 */
export function createKeyboardMove(opts = {}) {
  /** @type {Set<MoveAction>} */
  const pressed = new Set();
  let moveSpeed = Number.isFinite(opts.moveSpeed) ? Math.max(0.25, opts.moveSpeed) : 10;
  let gridSnap = !!opts.gridSnap;
  let cell = Number.isFinite(opts.cellSize) && opts.cellSize > 0 ? opts.cellSize : 1;
  let snapRepeatHz = Number.isFinite(opts.snapRepeatHz)
    ? Math.max(1, Math.min(30, opts.snapRepeatHz))
    : 8;
  let snapAccum = 0;

  function isMoveCode(code) {
    return Object.prototype.hasOwnProperty.call(KEYBOARD_MOVE_CODES, code);
  }

  /**
   * @param {string} code KeyboardEvent.code
   * @param {boolean} down
   * @returns {boolean} true if this code is a camera-move key
   */
  function setKey(code, down) {
    const action = KEYBOARD_MOVE_CODES[code];
    if (!action) return false;
    if (down) pressed.add(action);
    else pressed.delete(action);
    if (!pressed.size) snapAccum = 0;
    return true;
  }

  function clearKeys() {
    pressed.clear();
    snapAccum = 0;
  }

  function setMoveSpeed(speed) {
    if (!Number.isFinite(speed)) return moveSpeed;
    moveSpeed = Math.max(0.25, Math.min(64, speed));
    return moveSpeed;
  }

  function getMoveSpeed() {
    return moveSpeed;
  }

  function setGridSnap(on) {
    gridSnap = !!on;
    snapAccum = 0;
    return gridSnap;
  }

  function getGridSnap() {
    return gridSnap;
  }

  function setCellSize(size) {
    if (Number.isFinite(size) && size > 0) cell = size;
    return cell;
  }

  /**
   * Build camera-relative move intent in world space (unscaled).
   * Forward/back use horizontal look; strafe/pan use horizontal camera-right.
   * @param {import('three').Camera} camera
   * @param {THREE.Vector3} out
   */
  function computeIntent(camera, out) {
    out.set(0, 0, 0);
    if (!pressed.size) return out;

    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-8) {
      // Looking nearly straight up/down — fall back to -Z in camera space, flattened.
      _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      _forward.y = 0;
    }
    if (_forward.lengthSq() < 1e-8) _forward.set(0, 0, -1);
    else _forward.normalize();

    _right.setFromMatrixColumn(camera.matrix, 0);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();

    if (pressed.has("forward")) out.add(_forward);
    if (pressed.has("back")) out.sub(_forward);
    if (pressed.has("right") || pressed.has("panRight")) out.add(_right);
    if (pressed.has("left") || pressed.has("panLeft")) out.sub(_right);

    if (out.lengthSq() > 1e-8) out.normalize();
    return out;
  }

  /**
   * Apply held keys for one frame.
   * @param {import('three').Camera} camera
   * @param {(dx:number,dy:number,dz:number)=>void} translatePivot
   * @param {number} dt seconds
   * @param {(() => void)|null} [snapPivotToGrid]
   * @returns {boolean} true if a move was applied
   */
  function tick(camera, translatePivot, dt, snapPivotToGrid = null) {
    if (!pressed.size || !camera || typeof translatePivot !== "function") return false;
    const t = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    if (t <= 0) return false;

    computeIntent(camera, _delta);
    if (_delta.lengthSq() < 1e-8) return false;

    if (gridSnap) {
      snapAccum += t * snapRepeatHz * Math.max(0.25, moveSpeed / 10);
      let steps = 0;
      while (snapAccum >= 1 && steps < 4) {
        snapAccum -= 1;
        steps += 1;
      }
      if (!steps) return false;
      const dist = steps * cell;
      translatePivot(_delta.x * dist, _delta.y * dist, _delta.z * dist);
      snapPivotToGrid?.();
      return true;
    }

    const dist = moveSpeed * t;
    translatePivot(_delta.x * dist, _delta.y * dist, _delta.z * dist);
    return true;
  }

  return {
    isMoveCode,
    setKey,
    clearKeys,
    tick,
    setMoveSpeed,
    getMoveSpeed,
    setGridSnap,
    getGridSnap,
    setCellSize,
    /** @returns {ReadonlySet<MoveAction>} */
    getPressed: () => pressed,
  };
}
