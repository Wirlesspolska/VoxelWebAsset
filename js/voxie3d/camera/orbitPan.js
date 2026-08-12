import * as THREE from "three";
import { createCameraController } from "./createCameraController.js";

/**
 * Create a PerspectiveCamera + orbit camera controller for the forge.
 * Prefer `createCameraController(camera, dom, opts)` when you already own a camera.
 *
 * Bindings (via controller + ForgeInput):
 * - Alt+LMB / Alt+RMB drag: orbit about pivot ball
 * - Plain RMB: erase (ForgeInput, place/erase tools)
 * - Shift+RMB / MMB drag: pan pivot · MMB click: cycle plane
 * - Alt/Ctrl+scroll (or tool=none): zoom · Scroll / [ ] / , . : ±1 slice
 * - WASD / arrows / QE: keyboard camera move (see keyboardMove.js)
 */
export function createForgeCamera(canvas, opts = {}) {
  const size = opts.gridSize || 24;
  const far = opts.far ?? Math.max(500, size * 12);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, far);
  // Placeholder pose — createVoxie3D / frameWorkspace set the real above-back framing.
  const dist = size * 1.55;
  camera.position.set(dist * 0.78, dist * 0.62, dist * 0.78);
  // Pivot defaults to cell-center near origin (controller snaps/syncs to edit plane).
  camera.lookAt(0.5, opts.targetY ?? 0.5, 0.5);

  const controller = createCameraController(camera, canvas, opts);
  return controller;
}

export { createCameraController } from "./createCameraController.js";
export { createWheelAccumulator, DEFAULT_SLICE_WHEEL_THRESHOLD } from "./wheelAccum.js";
