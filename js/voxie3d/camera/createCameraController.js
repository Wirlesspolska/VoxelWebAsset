import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createWheelAccumulator } from "./wheelAccum.js";
import { createKeyboardMove } from "./keyboardMove.js";

/** @typedef {'orbit'|'fps'|'topdown'} CameraMode */

const CELL = 1;
const _offset = new THREE.Vector3();
const _panOffset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _spherical = new THREE.Spherical();
const _prevTarget = new THREE.Vector3();

function snapToCellCenter(v) {
  return Math.floor(v) + 0.5 * CELL;
}

/**
 * Modular forge camera controller.
 *
 * Orbit mode bindings:
 * - Alt+LMB / Alt+RMB drag: orbit around look-at (controls.target)
 * - Plain RMB is free for ForgeInput erase (place/erase tools)
 * - MMB / Shift+RMB drag: free screen-space pan (translate camera + target together)
 * - zoom() / Alt+scroll: dolly distance
 * - WASD / arrows / QE: keyboard move via createKeyboardMove (ForgeInput)
 *
 * Pivot is OrbitControls.target; optional ball visual via attachPivotVisual(scene).
 * Pan does not require the ball — it is a visual-only orbit reference.
 * Slice nudge APIs stay here; ForgeInput owns key routing ([ ] / , . for slice).
 *
 * @param {import('three').PerspectiveCamera} camera
 * @param {HTMLElement} dom
 * @param {object} [opts]
 */
export function createCameraController(camera, dom, opts = {}) {
  if (!camera) throw new Error("createCameraController: camera required");
  if (!dom) throw new Error("createCameraController: dom required");

  const size = opts.gridSize || 24;
  const minDistance = opts.minDistance ?? 4;
  let maxDistance = opts.maxDistance ?? size * 5;
  const cell = opts.cellSize ?? CELL;
  let minDistanceLive = minDistance;

  /** @type {CameraMode} */
  let mode = opts.mode === "fps" || opts.mode === "topdown" ? opts.mode : "orbit";

  /** @type {HTMLElement} */
  let domEl = dom;
  /** @type {OrbitControls} */
  let controls = new OrbitControls(camera, domEl);
  function applyControlsDefaults(c) {
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.enableZoom = false;
    c.enablePan = true;
    c.enableRotate = true;
    // Screen-plane pan: move camera + target together (not orbit-around-ball).
    c.screenSpacePanning = true;
    c.panSpeed = opts.panSpeed ?? 1.15;
    c.minDistance = minDistanceLive;
    c.maxDistance = maxDistance;
    // OrbitControls built-in arrow keys stay off — we own WASD/arrows via keyboardMove.
    c.keyPanSpeed = 0;
    c.keys = { LEFT: 0, UP: 0, RIGHT: 0, BOTTOM: 0 };
    c.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      // Plain RMB reserved for erase; orbit via Alt+LMB / Alt+RMB.
      RIGHT: null,
    };
    c.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
  }
  applyControlsDefaults(controls);

  const keyboardMove = createKeyboardMove({
    moveSpeed: opts.moveSpeed,
    gridSnap: opts.keyboardGridSnap ?? opts.gridSnap,
    cellSize: cell,
  });

  if (opts.target instanceof THREE.Vector3) {
    controls.target.copy(opts.target);
  } else {
    controls.target.set(
      0.5 * cell,
      opts.targetY != null ? opts.targetY : 0.5 * cell,
      0.5 * cell
    );
  }
  camera.lookAt(controls.target);

  let shiftPan = false;
  /** @type {THREE.Mesh|null} */
  let pivotBall = null;
  /** @type {((pos: THREE.Vector3) => void)|null} */
  let onPivotChange = typeof opts.onPivotChange === "function" ? opts.onPivotChange : null;
  const sliceWheel = createWheelAccumulator(opts.sliceWheelThreshold);
  const onNudgeSlice = typeof opts.onNudgeSlice === "function" ? opts.onNudgeSlice : null;

  function syncMouseButtons(event) {
    if (mode !== "orbit") {
      controls.mouseButtons.LEFT = null;
      controls.mouseButtons.RIGHT = null;
      return;
    }
    const alt = !!(event && event.altKey);
    const shift = shiftPan || !!(event && event.shiftKey);
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    // Alt+LMB orbits; plain LMB stays free for place/select/tools.
    controls.mouseButtons.LEFT = alt ? THREE.MOUSE.ROTATE : null;
    // Shift+RMB pans; Alt+RMB orbits; plain RMB free for erase.
    if (shift) {
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    } else if (alt) {
      controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    } else {
      controls.mouseButtons.RIGHT = null;
    }
  }

  function onPointerDownCapture(event) {
    syncMouseButtons(event);
  }

  const bindPointers = opts.bindPointers !== false;
  if (bindPointers) {
    domEl.addEventListener("pointerdown", onPointerDownCapture, true);
  }

  function applyOrbitEnabled() {
    const orbiting = mode === "orbit";
    controls.enableRotate = orbiting;
    controls.enablePan = orbiting;
    controls.enabled = orbiting;
  }
  applyOrbitEnabled();
  syncMouseButtons(null);

  function emitPivot() {
    if (pivotBall) pivotBall.position.copy(controls.target);
    onPivotChange?.(controls.target);
  }

  /**
   * @param {CameraMode} next
   */
  function setMode(next) {
    if (next !== "orbit" && next !== "fps" && next !== "topdown") return mode;
    mode = next;
    applyOrbitEnabled();
    syncMouseButtons(null);
    return mode;
  }

  function getMode() {
    return mode;
  }

  function getPivot(out = new THREE.Vector3()) {
    return out.copy(controls.target);
  }

  /**
   * Move look-target + camera by the same delta (keeps orbit radius/angles).
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   */
  function translatePivot(dx, dy, dz) {
    controls.target.x += dx;
    controls.target.y += dy;
    controls.target.z += dz;
    camera.position.x += dx;
    camera.position.y += dy;
    camera.position.z += dz;
    controls.update();
    emitPivot();
  }

  /** Snap pivot to integer cell centers (stable “center ball”). */
  function snapPivotToGrid() {
    _prevTarget.copy(controls.target);
    controls.target.x = snapToCellCenter(controls.target.x / cell) * cell;
    controls.target.y = snapToCellCenter(controls.target.y / cell) * cell;
    controls.target.z = snapToCellCenter(controls.target.z / cell) * cell;
    const ddx = controls.target.x - _prevTarget.x;
    const ddy = controls.target.y - _prevTarget.y;
    const ddz = controls.target.z - _prevTarget.z;
    if (ddx || ddy || ddz) {
      camera.position.x += ddx;
      camera.position.y += ddy;
      camera.position.z += ddz;
    }
    controls.update();
    emitPivot();
  }

  /**
   * Nudge pivot by ±N cells on world axes, then snap.
   * @param {number} dx cells
   * @param {number} dy cells
   * @param {number} dz cells
   */
  function nudgePivot(dx = 0, dy = 0, dz = 0) {
    if (mode !== "orbit") return;
    const sx = (dx | 0) * cell;
    const sy = (dy | 0) * cell;
    const sz = (dz | 0) * cell;
    if (!sx && !sy && !sz) return;
    translatePivot(sx, sy, sz);
    snapPivotToGrid();
  }

  /**
   * Pin pivot onto the edit-plane slice (integer), snap free axes to cell centers.
   * @param {'x'|'y'|'z'} axis
   * @param {number} slice
   */
  function syncPivotToEditPlane(axis, slice) {
    if (mode !== "orbit") return;
    _prevTarget.copy(controls.target);
    const s = ((slice | 0) + 0.5) * cell;
    controls.target.x = snapToCellCenter(controls.target.x / cell) * cell;
    controls.target.y = snapToCellCenter(controls.target.y / cell) * cell;
    controls.target.z = snapToCellCenter(controls.target.z / cell) * cell;
    if (axis === "z") controls.target.z = s;
    else if (axis === "y") controls.target.y = s;
    else controls.target.x = s;
    camera.position.x += controls.target.x - _prevTarget.x;
    camera.position.y += controls.target.y - _prevTarget.y;
    camera.position.z += controls.target.z - _prevTarget.z;
    controls.update();
    emitPivot();
  }

  /**
   * Frame an empty / new workspace: pivot at volume origin (edit-plane pinned),
   * camera above-and-back (~45° isometric look-down) so floor grid + slice are in view.
   * @param {object} [opts]
   * @param {number} [opts.gridSize] footprint used for distance
   * @param {'x'|'y'|'z'} [opts.axis] edit-plane axis (pins look-at)
   * @param {number} [opts.slice] edit-plane slice
   * @param {number} [opts.distance] override orbit distance
   */
  function frameWorkspace(opts = {}) {
    if (mode !== "orbit") return;
    const footprint = Math.max(1, Number(opts.gridSize) || size);
    const dist = Math.max(
      Number.isFinite(opts.distance) ? opts.distance : footprint * 1.55,
      minDistance + 2
    );
    // Origin cell centers on free axes; pin the edit-plane axis to slice center.
    let tx = 0.5 * cell;
    let ty = 0.5 * cell;
    let tz = 0.5 * cell;
    if (opts.axis === "x" || opts.axis === "y" || opts.axis === "z") {
      const s = ((opts.slice | 0) + 0.5) * cell;
      if (opts.axis === "z") tz = s;
      else if (opts.axis === "y") ty = s;
      else tx = s;
    } else if (opts.target instanceof THREE.Vector3) {
      tx = opts.target.x;
      ty = opts.target.y;
      tz = opts.target.z;
    }
    controls.target.set(tx, ty, tz);
    // Above + back along +X/+Z — isometric-ish look-down at the origin/grid.
    const horiz = dist * 0.78;
    const elevY = dist * 0.62;
    camera.position.set(tx + horiz, ty + elevY, tz + horiz);
    camera.lookAt(controls.target);
    if (Number.isFinite(opts.maxDistance) && opts.maxDistance > minDistance) {
      controls.maxDistance = opts.maxDistance;
    }
    controls.update();
    emitPivot();
  }

  /**
   * Attach a small center ball at the orbit pivot (scene-owned visual).
   * @param {import('three').Scene} scene
   * @param {object} [visualOpts]
   */
  function attachPivotVisual(scene, visualOpts = {}) {
    if (!scene) return null;
    detachPivotVisual(scene);
    const r = visualOpts.radius ?? Math.max(0.28, Math.min(0.55, size * 0.02));
    pivotBall = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 12),
      new THREE.MeshBasicMaterial({
        color: visualOpts.color ?? 0xffc857,
        transparent: true,
        opacity: visualOpts.opacity ?? 0.55,
        depthTest: true,
      })
    );
    pivotBall.name = "voxie3d-pivot-ball";
    pivotBall.renderOrder = 4;
    pivotBall.raycast = () => {};
    pivotBall.position.copy(controls.target);
    if (visualOpts.visible === false) pivotBall.visible = false;
    scene.add(pivotBall);
    return pivotBall;
  }

  function detachPivotVisual(scene) {
    if (!pivotBall) return;
    scene?.remove?.(pivotBall);
    pivotBall.geometry?.dispose?.();
    pivotBall.material?.dispose?.();
    pivotBall = null;
  }

  function setPivotVisible(on) {
    if (pivotBall) pivotBall.visible = !!on;
  }

  function orbit(dTheta = 0, dPhi = 0) {
    if (mode !== "orbit") return;
    if (!dTheta && !dPhi) return;
    _offset.copy(camera.position).sub(controls.target);
    _spherical.setFromVector3(_offset);
    _spherical.theta += dTheta;
    _spherical.phi = THREE.MathUtils.clamp(_spherical.phi + dPhi, 0.05, Math.PI - 0.05);
    _offset.setFromSpherical(_spherical);
    camera.position.copy(controls.target).add(_offset);
    camera.lookAt(controls.target);
    controls.update();
    emitPivot();
  }

  function pan(deltaX = 0, deltaY = 0) {
    if (mode !== "orbit") return;
    if (!deltaX && !deltaY) return;
    const el = controls.domElement;
    const clientH = el.clientHeight || 1;
    const distance = camera.position.distanceTo(controls.target);
    const fov = (camera.isPerspectiveCamera ? camera.fov : 45) * (Math.PI / 180);
    const targetDistance = distance * Math.tan(fov / 2) * 2;
    const panX = (deltaX * targetDistance) / clientH;
    const panY = (deltaY * targetDistance) / clientH;
    _right.setFromMatrixColumn(camera.matrix, 0).normalize().multiplyScalar(-panX);
    if (controls.screenSpacePanning) {
      _up.setFromMatrixColumn(camera.matrix, 1).normalize().multiplyScalar(panY);
    } else {
      _up.set(0, 1, 0).multiplyScalar(panY);
    }
    _panOffset.copy(_right).add(_up);
    controls.target.add(_panOffset);
    camera.position.add(_panOffset);
    controls.update();
    emitPivot();
  }

  function zoom(deltaY = 0) {
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    if (mode !== "orbit") return;
    const factor = Math.exp(deltaY * 0.00135);
    _offset.copy(camera.position).sub(controls.target);
    let dist = _offset.length() * factor;
    dist = THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance);
    if (dist < 1e-6) return;
    _offset.setLength(dist);
    camera.position.copy(controls.target).add(_offset);
    camera.lookAt(controls.target);
    controls.update();
  }

  function dolly(deltaY) {
    zoom(deltaY);
  }

  function nudgeSlice(delta) {
    const step = delta | 0;
    if (!step || !onNudgeSlice) return;
    onNudgeSlice(step > 0 ? 1 : -1);
  }

  function accumulateSliceWheel(deltaY) {
    const dir = sliceWheel.push(deltaY);
    if (dir && onNudgeSlice) onNudgeSlice(dir);
    return dir;
  }

  function handleWheel(event, intent = {}) {
    if (intent.zoom) {
      zoom(event.deltaY);
      return "zoom";
    }
    const dir = accumulateSliceWheel(event.deltaY);
    return dir ? "slice" : "slice-accum";
  }

  /**
   * Legacy hook — orbit is Alt+LMB / Alt+RMB (see syncMouseButtons).
   * Kept so callers of setAltOrbit do not break; no longer arms LMB orbit alone.
   */
  function setAltOrbit(_on) {
    syncMouseButtons(null);
  }

  function setShiftPan(on) {
    shiftPan = !!on;
    syncMouseButtons(null);
  }

  function setMaxDistance(d) {
    if (Number.isFinite(d) && d > controls.minDistance) {
      maxDistance = d;
      controls.maxDistance = d;
    }
  }

  function setMinDistance(d) {
    if (Number.isFinite(d) && d > 0) {
      minDistanceLive = d;
      controls.minDistance = d;
    }
  }

  /**
   * Rebind OrbitControls + pointer capture to a new canvas (WebGL context recreate).
   * Preserves pivot target and camera pose.
   * @param {HTMLElement} nextDom
   */
  function rebindDom(nextDom) {
    if (!nextDom || nextDom === domEl) return domEl;
    const target = controls.target.clone();
    if (bindPointers) {
      domEl.removeEventListener("pointerdown", onPointerDownCapture, true);
    }
    controls.dispose();
    domEl = nextDom;
    controls = new OrbitControls(camera, domEl);
    applyControlsDefaults(controls);
    controls.target.copy(target);
    camera.lookAt(controls.target);
    applyOrbitEnabled();
    syncMouseButtons(null);
    if (bindPointers) {
      domEl.addEventListener("pointerdown", onPointerDownCapture, true);
    }
    // Keep public handle in sync (hosts may cache cam.controls).
    api.controls = controls;
    return domEl;
  }

  function resize(width, height) {
    if (!camera.isPerspectiveCamera) return;
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  /**
   * @param {string} code KeyboardEvent.code
   * @param {boolean} down
   */
  function setMoveKey(code, down) {
    return keyboardMove.setKey(code, down);
  }

  function clearMoveKeys() {
    keyboardMove.clearKeys();
  }

  function setMoveSpeed(speed) {
    return keyboardMove.setMoveSpeed(speed);
  }

  function getMoveSpeed() {
    return keyboardMove.getMoveSpeed();
  }

  function setKeyboardGridSnap(on) {
    return keyboardMove.setGridSnap(on);
  }

  function getKeyboardGridSnap() {
    return keyboardMove.getGridSnap();
  }

  function update(dt = 1 / 60) {
    if (mode === "orbit") {
      keyboardMove.tick(camera, translatePivot, dt, keyboardMove.getGridSnap() ? snapPivotToGrid : null);
      controls.update();
    }
    if (pivotBall) pivotBall.position.copy(controls.target);
  }

  function dispose(scene) {
    if (bindPointers) {
      domEl.removeEventListener("pointerdown", onPointerDownCapture, true);
    }
    keyboardMove.clearKeys();
    detachPivotVisual(scene);
    sliceWheel.reset();
    controls.dispose();
  }

  const api = {
    camera,
    controls,
    setMode,
    getMode,
    orbit,
    pan,
    zoom,
    dolly,
    nudgeSlice,
    accumulateSliceWheel,
    handleWheel,
    getPivot,
    nudgePivot,
    snapPivotToGrid,
    syncPivotToEditPlane,
    frameWorkspace,
    translatePivot,
    attachPivotVisual,
    detachPivotVisual,
    setPivotVisible,
    setAltOrbit,
    setShiftPan,
    setMoveKey,
    clearMoveKeys,
    setMoveSpeed,
    getMoveSpeed,
    setKeyboardGridSnap,
    getKeyboardGridSnap,
    isMoveKeyCode: (code) => keyboardMove.isMoveCode(code),
    setMaxDistance,
    setMinDistance,
    rebindDom,
    resize,
    update,
    dispose,
    /** True when LEFT is armed for rotate (Alt held at last sync). */
    isAltOrbit: () => controls.mouseButtons.LEFT === THREE.MOUSE.ROTATE,
    isShiftPan: () => shiftPan,
  };
  return api;
}
