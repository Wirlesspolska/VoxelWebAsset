import * as THREE from "three";
import { paintBrushCells } from "../tools/brushes.js";
import { shapeCells } from "../tools/shapes.js";
import {
  strokeDirectionGhosts,
  pickStrokeDirection,
  strokeCellsStraight,
  strokeCellsSmooth,
  normalizeStrokeLength,
} from "../tools/stroke.js";
import { CELL } from "../render/VoxelRenderer.js";
import { SCROLL_OWNERSHIP } from "../tools/registry.js";

const MMB_CLICK_PX = 5;
const BOX_SELECT_PX = 4;

/** Slice ±1 — arrows move the camera now; use brackets / comma-period. */
const SLICE_KEYS = {
  BracketRight: 1,
  Period: 1,
  BracketLeft: -1,
  Comma: -1,
};

function isEditableTarget(el) {
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return !!el.closest?.("input, textarea, select, [contenteditable='true']");
}

/**
 * Pointer / keyboard bindings for the forge viewport.
 *
 * | Input | Action |
 * | LMB click / hold-drag | Place: paint stream · Erase tool: erase stream · other tools as designed |
 * | RMB click / hold-drag | Erase stream (place or erase tool) — same brush footprint |
 * | Alt+LMB / Alt+RMB drag | Orbit about look-at (pivot) |
 * | MMB drag | Free pan (camera + target in view plane) |
 * | Shift+RMB drag | Free pan (same as MMB) |
 * | Shift+LMB | Select / box select |
 * | MMB click | Cycle edit plane axis |
 * | Scroll | ±1 slice · Alt/Ctrl+Scroll zoom |
 * | Scroll (Generate shape) | Reroll only (any modifier) — slice/zoom dehooked until LMB exit or Esc |
 *
 * Exclusive edit modes (exactly one): place | erase | select | generate | stroke | shape | texturizer | none.
 * Camera-nav (Alt+LMB orbit, MMB/Shift+RMB pan, WASD/QE) is orthogonal. See tools/registry.js SCROLL_OWNERSHIP.
 * | W/S · ↑/↓ | Camera forward / back (horizontal look) |
 * | A/D · ←/→ | Camera strafe left / right |
 * | Q/E | Camera pan left / right (along camera right) |
 * | [ ] · , . | ±1 slice (edit plane); ignored in form fields |
 * | Esc | Deselect · cancel Generate shape (restore scroll) |
 * | Ctrl+Z | Undo · Ctrl+Y / Ctrl+Shift+Z Redo |
 *
 * Note: `paintDrag` pref remains for API/UI compat; place/erase LMB and RMB erase
 * use dedicated hold-stream paths and do not require the pref.
 */
export class ForgeInput {
  constructor(ctx) {
    this.ctx = ctx;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._mmbDown = null;
    this._painting = false;
    this._erasing = false;
    this._pendingPlace = null;
    this._pendingErase = null;
    this._pendingGenerate = null;
    this._generateHover = null;
    this._shapeDrag = null;
    this._strokeAnchor = null;
    this._strokeHoverDir = null;
    this._boxSelect = null;
    this._boxSelectPtr = { x: 0, y: 0 };
    this._boxSelectRaf = 0;
    this._boxProject = new THREE.Vector3();
    this._bound = {
      pointerdown: (e) => this.onPointerDown(e),
      pointermove: (e) => this.onPointerMove(e),
      pointerup: (e) => this.onPointerUp(e),
      pointerleave: () => {
        // Keep active LMB/RMB hold-stream alive across leave; only clear idle pending.
        if (this._painting || this._erasing) return;
        this._cancelPendingPaint();
        // Keep box-select alive across leave; only clear paint pending.
      },
      contextmenu: (e) => e.preventDefault(),
      wheel: (e) => this.onWheel(e),
      keydown: (e) => this.onKeyDown(e),
      keyup: (e) => this.onKeyUp(e),
      blur: () => this.ctx.cam?.clearMoveKeys?.(),
    };
    this._bindDom(ctx.dom);
    window.addEventListener("keydown", this._bound.keydown);
    window.addEventListener("keyup", this._bound.keyup);
    window.addEventListener("blur", this._bound.blur);
  }

  _unbindDom() {
    const el = this.ctx.dom;
    if (!el) return;
    el.removeEventListener("pointerdown", this._bound.pointerdown);
    el.removeEventListener("pointermove", this._bound.pointermove);
    el.removeEventListener("pointerup", this._bound.pointerup);
    el.removeEventListener("pointerleave", this._bound.pointerleave);
    el.removeEventListener("contextmenu", this._bound.contextmenu);
    el.removeEventListener("wheel", this._bound.wheel);
  }

  _bindDom(el) {
    if (!el) return;
    el.style.touchAction = "none";
    el.style.overscrollBehavior = "none";
    el.addEventListener("pointerdown", this._bound.pointerdown);
    el.addEventListener("pointermove", this._bound.pointermove);
    el.addEventListener("pointerup", this._bound.pointerup);
    el.addEventListener("pointerleave", this._bound.pointerleave);
    el.addEventListener("contextmenu", this._bound.contextmenu);
    el.addEventListener("wheel", this._bound.wheel, { passive: false });
  }

  /**
   * Move pointer/wheel listeners to a replacement canvas (WebGL recreate).
   * @param {HTMLElement} nextDom
   */
  rebindDom(nextDom) {
    if (!nextDom || nextDom === this.ctx.dom) return this.ctx.dom;
    this._unbindDom();
    this.ctx.dom = nextDom;
    this._bindDom(nextDom);
    return nextDom;
  }

  dispose() {
    if (this._boxSelectRaf) cancelAnimationFrame(this._boxSelectRaf);
    this._boxSelectRaf = 0;
    this.ctx.renderer3d?.clearSelectDragPreview?.();
    this.ctx.cam?.clearMoveKeys?.();
    this._unbindDom();
    window.removeEventListener("keydown", this._bound.keydown);
    window.removeEventListener("keyup", this._bound.keyup);
    window.removeEventListener("blur", this._bound.blur);
  }

  _ndc(event) {
    const rect = this.ctx.dom.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _hit() {
    this.raycaster.setFromCamera(this.pointer, this.ctx.camera);
    const hits = this.raycaster.intersectObjects(this.ctx.renderer3d.getPickables(), false);
    if (!hits.length) return null;
    const editPlane = this.ctx.renderer3d.editPlane;
    // Prefer any voxel mesh (solid or ghost). Skipping ghost used to fall through to
    // the edit plane — pointer on a translucent base slice then "placed under/behind".
    for (const h of hits) {
      if (h.object === editPlane) continue;
      if (this._voxelKeyFromHit(h)) return h;
    }
    for (const h of hits) {
      if (h.object === editPlane) return h;
    }
    return hits[0] || null;
  }

  _voxelKeyFromHit(hit) {
    if (!hit) return null;
    return (
      hit.object?.userData?.voxelKey ||
      this.ctx.renderer3d.keyFromHit?.(hit) ||
      null
    );
  }

  /**
   * Face outward normal from hit point vs occupied cell center (Minecraft-style).
   * On edges/corners between several blocks, prefer an *empty* adjacent cell
   * so snap preview does not die when 2–3 voxels share a seam.
   */
  _faceNormalFromPoint(hit, vx, vy, vz) {
    const { grid } = this.ctx;
    const cx = (vx + 0.5) * CELL;
    const cy = (vy + 0.5) * CELL;
    const cz = (vz + 0.5) * CELL;
    const dx = hit.point.x - cx;
    const dy = hit.point.y - cy;
    const dz = hit.point.z - cz;
    /** @type {Array<{ax:number, nx:number, ny:number, nz:number}>} */
    const ranked = [
      { ax: Math.abs(dx), nx: dx >= 0 ? 1 : -1, ny: 0, nz: 0 },
      { ax: Math.abs(dy), nx: 0, ny: dy >= 0 ? 1 : -1, nz: 0 },
      { ax: Math.abs(dz), nx: 0, ny: 0, nz: dz >= 0 ? 1 : -1 },
    ].sort((a, b) => b.ax - a.ax);

    for (const c of ranked) {
      if (!grid.has(vx + c.nx, vy + c.ny, vz + c.nz)) {
        return { nx: c.nx, ny: c.ny, nz: c.nz };
      }
    }
    // All six cardinal empties as last resort (seam fully boxed in).
    const dirs = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [nx, ny, nz] of dirs) {
      if (!grid.has(vx + nx, vy + ny, vz + nz)) return { nx, ny, nz };
    }
    return { nx: ranked[0].nx, ny: ranked[0].ny, nz: ranked[0].nz };
  }

  _cellFromHit(hit, mode) {
    if (!hit) return null;
    const { grid, renderer3d } = this.ctx;
    if (hit.object === renderer3d.editPlane) {
      const p = hit.point.clone();
      if (grid.axis === "z") p.z = (grid.slice + 0.5) * CELL;
      else if (grid.axis === "y") p.y = (grid.slice + 0.5) * CELL;
      else p.x = (grid.slice + 0.5) * CELL;
      const c = renderer3d.worldToCell(p);
      c[grid.axis] = grid.slice;
      return c;
    }
    const key = this._voxelKeyFromHit(hit);
    if (!key) return null;
    const [vx, vy, vz] = key.split("|").map(Number);
    if (mode === "erase" || mode === "select") return { x: vx, y: vy, z: vz };

    const { nx, ny, nz } = this._faceNormalFromPoint(hit, vx, vy, vz);
    const target = { x: vx + nx, y: vy + ny, z: vz + nz };
    if (grid.has(target.x, target.y, target.z)) return null;
    return target;
  }

  _brushFootprint(cell) {
    const state = this.ctx.getState();
    const { grid } = this.ctx;
    return paintBrushCells(cell.x, cell.y, cell.z, grid.axis, {
      brushShape: state.brushShape,
      brushW: state.brushW,
      brushH: state.brushH,
      circleRadius: state.circleRadius,
      brushSize: state.brushSize,
    });
  }

  _applyCells(cells, mode, label) {
    if (!cells?.length) return;
    const state = this.ctx.getState();
    const { grid, api } = this.ctx;
    const editLabel = label || (mode === "place" ? "place" : "erase");
    const isGenerateStamp = editLabel === "generate";
    // Snapshot groups before mutate so undo restores voxels + auto stamp group together.
    const groupsBefore =
      isGenerateStamp && typeof api.groups?.exportGroups === "function"
        ? api.groups.exportGroups()
        : undefined;
    let changed = false;
    const touched = [];
    let expanded = false;
    /** @type {Record<string, object|null>} */
    const before = {};
    for (const c of cells) {
      const key = `${c.x}|${c.y}|${c.z}`;
      before[key] = api._snapCell?.(c.x, c.y, c.z) ?? (grid.get(c.x, c.y, c.z) || null);
    }
    for (const c of cells) {
      if (mode === "place") {
        if (!grid.inBounds(c.x, c.y, c.z)) {
          if (api.getAutoExpand?.() !== false && api.expandToInclude?.(c.x, c.y, c.z)) {
            expanded = true;
          } else {
            continue;
          }
        }
        const color =
          c.color ||
          (typeof api.resolvePlaceColor === "function"
            ? api.resolvePlaceColor(c.x, c.y, c.z)
            : state.colorHex);
        const opts = {
          color,
          partId: grid.partId,
          textureId: state.activeTextureId || null,
          texScale: state.texScale || null,
          materialId: state.materialId || null,
        };
        if (grid.set(c.x, c.y, c.z, opts)) {
          changed = true;
          touched.push(c);
        }
      } else if (grid.remove(c.x, c.y, c.z)) {
        changed = true;
        touched.push(c);
      }
    }
    if (changed) {
      const after = {};
      for (const c of touched) {
        const key = `${c.x}|${c.y}|${c.z}`;
        after[key] = api._snapCell?.(c.x, c.y, c.z) ?? (grid.get(c.x, c.y, c.z) || null);
        if (!(key in before)) before[key] = null;
      }
      // Create `{propName} #N` group before undo push so groupsAfter includes it.
      if (isGenerateStamp) api._groupGenerateStamp?.(touched);
      // Keep before keys that didn't change out of the diff — push full maps; stack dedupes
      api._pushVoxelDiff?.(editLabel, before, after, groupsBefore);
      api._onBrushApplied?.(touched, mode, editLabel);
    }
    if (expanded) api._onVolumeResized?.();
    else if (changed) api._notifyVolumeChange(touched);
    if (changed && mode === "place") api._rememberPaintColor?.(state.colorHex);
  }

  _applyBrush(cell, mode) {
    if (!cell) return;
    this._applyCells(this._brushFootprint(cell), mode);
  }

  _paintDragEnabled() {
    return !!this.ctx.getState().paintDrag;
  }

  /** Place/erase tools always hold-stream (Minecraft-style); paintDrag pref is optional elsewhere. */
  _editBrushHoldStream() {
    const tool = this.ctx.getState().tool;
    return tool === "place" || tool === "erase";
  }

  _cancelPendingPaint() {
    this._pendingPlace = null;
    this._pendingErase = null;
    this._pendingGenerate = null;
    this._painting = false;
    this._erasing = false;
  }

  _beginEraseAt(hit) {
    this._pendingErase = this._cellFromHit(hit, "erase");
    this._erasing = true;
    if (this._pendingErase) {
      this._applyBrush(this._pendingErase, "erase");
    }
  }

  _showGenerateGhost(cell) {
    const { api, renderer3d } = this.ctx;
    const state = this.ctx.getState();
    this._generateHover = cell;
    if (!cell || !api.shapeGen) {
      renderer3d.clearPreviewCells();
      renderer3d.setRollOver(null, state.colorHex, false);
      return;
    }
    renderer3d.setRollOver(null, state.colorHex, false);
    renderer3d.setPreviewCells(api.shapeGen.previewCellsAt(cell), state.colorHex);
  }

  onPointerDown(event) {
    // Alt+pointer: orbit (camera). Shift+RMB: pan. Leave those to OrbitControls.
    if (event.altKey) return;
    if (event.button === 2 && event.shiftKey) return;

    // RMB: erase hold-stream from place or erase tool (orbit moved to Alt+LMB/RMB).
    if (event.button === 2) {
      const state = this.ctx.getState();
      if (state.tool === "place" || state.tool === "erase") {
        this._ndc(event);
        this._beginEraseAt(this._hit());
        try {
          this.ctx.dom.setPointerCapture?.(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (event.button === 1) {
      this._mmbDown = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button !== 0) return;

    this._ndc(event);
    const hit = this._hit();
    const state = this.ctx.getState();
    const { api, grid, renderer3d } = this.ctx;

    // Shift+LMB select (additive / box) — defer commit until pointerup
    // so box-drag does not rebuild selection overlay every move/click.
    if (event.shiftKey) {
      const cell = this._cellFromHit(hit, "select") || this._cellFromHit(hit, "erase");
      this._boxSelect = {
        x0: event.clientX,
        y0: event.clientY,
        additive: true,
        startKey: cell ? `${cell.x}|${cell.y}|${cell.z}` : null,
        startCell: cell && grid.has(cell.x, cell.y, cell.z) ? cell : null,
      };
      return;
    }

    if (state.tool === "none") return;

    if (state.tool === "select") {
      const cell = this._cellFromHit(hit, "select");
      this._boxSelect = {
        x0: event.clientX,
        y0: event.clientY,
        additive: !!event.shiftKey,
        startKey: cell ? `${cell.x}|${cell.y}|${cell.z}` : null,
        startCell: cell && grid.has(cell.x, cell.y, cell.z) ? cell : null,
      };
      if (!event.shiftKey) api.selection?.clear();
      return;
    }

    if (state.tool === "erase") {
      // Dedicated hold-stream erase (paintDrag pref not required).
      this._beginEraseAt(hit);
      return;
    }

    if (state.tool === "shape") {
      const cell = this._cellFromHit(hit, "place");
      if (cell) {
        this._shapeDrag = { origin: cell, end: cell };
        renderer3d.setPreviewCells(
          shapeCells(state.shapeId || "rect", cell, cell, grid.axis),
          state.colorHex
        );
      }
      return;
    }

    if (state.tool === "stroke") {
      const cell = this._cellFromHit(hit, "place");
      if (cell) {
        this._strokeAnchor = cell;
        const len = normalizeStrokeLength(state.strokeLength, 5);
        const ghosts = strokeDirectionGhosts(cell, len, !!state.strokeSmooth);
        renderer3d.setPreviewCells(ghosts.flatMap((g) => g.cells), state.colorHex);
      }
      return;
    }

    if (state.tool === "texturizer") {
      if (api.selection?.size()) {
        api.applyTexturizerToSelection?.();
      } else {
        const cell = this._cellFromHit(hit, "place");
        if (cell) api.applyTexturizerToCells?.(this._brushFootprint(cell));
      }
      return;
    }

    if (state.tool === "generate") {
      // Stamp on LMB release (single undoable commit).
      this._pendingGenerate = this._cellFromHit(hit, "place");
      if (this._pendingGenerate) this._showGenerateGhost(this._pendingGenerate);
      return;
    }

    // place — dedicated hold-stream while LMB held (paintDrag pref not required)
    this._pendingPlace = this._cellFromHit(hit, "place");
    this._painting = true;
    if (this._pendingPlace) {
      this._applyBrush(this._pendingPlace, "place");
      this._pendingPlace = null;
    }
  }

  onPointerMove(event) {
    this._ndc(event);
    const state = this.ctx.getState();
    const hit = this._hit();
    const { grid, renderer3d } = this.ctx;

    if (this._shapeDrag) {
      const end = this._cellFromHit(hit, "place") || this._shapeDrag.end;
      this._shapeDrag.end = end;
      renderer3d.setPreviewCells(
        shapeCells(state.shapeId || "rect", this._shapeDrag.origin, end, grid.axis),
        state.colorHex
      );
      return;
    }

    if (this._strokeAnchor) {
      const hover = this._cellFromHit(hit, "place") || this._strokeAnchor;
      const dir = pickStrokeDirection(this._strokeAnchor, hover);
      const len = normalizeStrokeLength(state.strokeLength, 5);
      const secondary = state.strokeSmooth
        ? { axis: dir.axis === "y" ? "x" : "y", sign: 1 }
        : null;
      const cells = state.strokeSmooth
        ? strokeCellsSmooth(this._strokeAnchor, dir, len, secondary)
        : strokeCellsStraight(this._strokeAnchor, dir, len);
      renderer3d.setPreviewCells(cells, state.colorHex);
      this._strokeHoverDir = dir;
      return;
    }

    if (this._boxSelect) {
      this._boxSelectPtr.x = event.clientX;
      this._boxSelectPtr.y = event.clientY;
      if (!this._boxSelectRaf) {
        this._boxSelectRaf = requestAnimationFrame(() => {
          this._boxSelectRaf = 0;
          this._flushBoxSelectPreview();
        });
      }
      return;
    }

    if (state.tool === "generate" && !event.shiftKey) {
      const cell = this._cellFromHit(hit, "place");
      if (this._pendingGenerate != null) this._pendingGenerate = cell;
      this._showGenerateGhost(cell);
      return;
    }

    if (state.tool === "place" && !event.shiftKey && !this._erasing) {
      const cell = this._cellFromHit(hit, "place");
      if (this._pendingPlace !== undefined && this._pendingPlace !== null) {
        this._pendingPlace = cell;
      }
      if (cell) {
        // Always use preview path (fill + neon edges + contact faces) — rollover alone blended into bright lime.
        renderer3d.setRollOver(null, state.colorHex, false);
        renderer3d.setPreviewCells(this._brushFootprint(cell), state.colorHex);
      } else {
        renderer3d.clearPreviewCells();
        renderer3d.setRollOver(null, state.colorHex, false);
      }
    } else if (this._erasing || (state.tool === "erase" && this._pendingErase !== undefined)) {
      this._pendingErase = this._cellFromHit(hit, "erase");
      if (this._erasing) {
        // Keep place ghost from fighting erase-drag feedback.
        renderer3d.clearPreviewCells();
        renderer3d.setRollOver(null, state.colorHex, false);
      }
    } else if (state.tool !== "shape" && state.tool !== "stroke") {
      renderer3d.setRollOver(null, state.colorHex, false);
      if (state.tool === "place" || state.tool === "generate") renderer3d.clearPreviewCells();
    }

    // Hold-stream: place/erase dedicated paths (always), else paintDrag pref
    if (this._painting) {
      if (this._editBrushHoldStream() || this._paintDragEnabled()) {
        this._applyBrush(this._cellFromHit(hit, "place"), "place");
      }
    } else if (this._erasing) {
      if (this._editBrushHoldStream() || this._paintDragEnabled()) {
        this._applyBrush(this._cellFromHit(hit, "erase"), "erase");
      }
    }
  }

  onPointerUp(event) {
    const { api, grid, renderer3d } = this.ctx;
    const state = this.ctx.getState();

    if (event.button === 1 && this._mmbDown) {
      const dx = event.clientX - this._mmbDown.x;
      const dy = event.clientY - this._mmbDown.y;
      this._mmbDown = null;
      // Click (no drag) cycles edit plane; drag is free screen-space pan via OrbitControls.
      if (Math.hypot(dx, dy) < MMB_CLICK_PX) {
        api.cycleAxis();
      }
    }

    // RMB erase hold end (orbit/pan left to camera when Alt/Shift)
    if (event.button === 2) {
      if (this._erasing || this._pendingErase) {
        this._pendingErase = null;
        this._erasing = false;
      }
      try {
        if (this.ctx.dom.hasPointerCapture?.(event.pointerId)) {
          this.ctx.dom.releasePointerCapture?.(event.pointerId);
        }
      } catch {
        /* ignore */
      }
      return;
    }

    // Free pan (MMB / Shift+RMB) must NOT snap back to the edit-plane pivot ball —
    // that made navigation feel glued to the center. Slice keys / wheel still sync.

    if (this._shapeDrag && event.button === 0) {
      const cells = shapeCells(
        state.shapeId || "rect",
        this._shapeDrag.origin,
        this._shapeDrag.end,
        grid.axis
      );
      this._applyCells(cells, "place");
      this._shapeDrag = null;
      renderer3d.clearPreviewCells();
    }

    if (this._strokeAnchor && event.button === 0) {
      const dir = this._strokeHoverDir || pickStrokeDirection(this._strokeAnchor, this._strokeAnchor);
      const len = normalizeStrokeLength(state.strokeLength, 5);
      const secondary = state.strokeSmooth
        ? { axis: dir.axis === "y" ? "x" : "y", sign: 1 }
        : null;
      const cells = state.strokeSmooth
        ? strokeCellsSmooth(this._strokeAnchor, dir, len, secondary)
        : strokeCellsStraight(this._strokeAnchor, dir, len);
      this._applyCells(cells, "place");
      if (state.strokeAsGroup) {
        api.startGroup?.({ color: state.colorHex });
        api._onBrushApplied?.(cells, "place");
        api.stopGroup?.();
      }
      this._strokeAnchor = null;
      this._strokeHoverDir = null;
      renderer3d.clearPreviewCells();
    }

    if (this._boxSelect && event.button === 0) {
      if (this._boxSelectRaf) {
        cancelAnimationFrame(this._boxSelectRaf);
        this._boxSelectRaf = 0;
      }
      renderer3d.clearSelectDragPreview?.();
      const dx = event.clientX - this._boxSelect.x0;
      const dy = event.clientY - this._boxSelect.y0;
      if (Math.hypot(dx, dy) >= BOX_SELECT_PX) {
        const keys = this._keysInScreenBox(
          this._boxSelect.x0,
          this._boxSelect.y0,
          event.clientX,
          event.clientY
        );
        api.selection?.setKeys(keys, this._boxSelect.additive);
      } else if (this._boxSelect.startCell) {
        const c = this._boxSelect.startCell;
        api.selection?.toggle(c.x, c.y, c.z);
      }
      this._boxSelect = null;
    }

    if (event.button === 0) {
      // Stamp once on release when not hold-streaming (legacy paintDrag-off path for non-edit tools).
      const holdStream = this._editBrushHoldStream();
      if (this._pendingPlace && state.tool === "place" && !holdStream && !this._paintDragEnabled()) {
        this._applyBrush(this._pendingPlace, "place");
      }
      if (this._pendingErase && state.tool === "erase" && !holdStream && !this._paintDragEnabled()) {
        this._applyBrush(this._pendingErase, "erase");
      }
      if (this._pendingGenerate && state.tool === "generate" && api.shapeGen) {
        const cells = api.shapeGen.placeCellsAt(this._pendingGenerate, (x, y, z) =>
          typeof api.resolvePlaceColor === "function"
            ? api.resolvePlaceColor(x, y, z)
            : state.colorHex
        );
        this._applyCells(cells, "place", "generate");
        // LMB commit exits generate → place (restores slice/zoom scroll).
        this._generateHover = null;
        renderer3d.clearPreviewCells?.();
        api.setTool("place");
      }
      this._pendingPlace = null;
      this._pendingErase = null;
      this._pendingGenerate = null;
      this._painting = false;
      this._erasing = false;
    }
  }

  /** rAF-throttled live marquee — no volume remesh. */
  _flushBoxSelectPreview() {
    if (!this._boxSelect) return;
    const { renderer3d } = this.ctx;
    const dx = this._boxSelectPtr.x - this._boxSelect.x0;
    const dy = this._boxSelectPtr.y - this._boxSelect.y0;
    if (Math.hypot(dx, dy) < BOX_SELECT_PX) {
      renderer3d.clearSelectDragPreview?.();
      return;
    }
    const keys = this._keysInScreenBox(
      this._boxSelect.x0,
      this._boxSelect.y0,
      this._boxSelectPtr.x,
      this._boxSelectPtr.y
    );
    renderer3d.setSelectDragPreview?.(keys);
  }

  _keysInScreenBox(x0, y0, x1, y1) {
    const { camera, grid, dom } = this.ctx;
    const rect = dom.getBoundingClientRect();
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const keys = [];
    const v = this._boxProject;
    for (const cell of grid.all()) {
      v.set((cell.x + 0.5) * CELL, (cell.y + 0.5) * CELL, (cell.z + 0.5) * CELL);
      v.project(camera);
      if (v.z < -1 || v.z > 1) continue;
      const sx = rect.left + ((v.x + 1) / 2) * rect.width;
      const sy = rect.top + ((-v.y + 1) / 2) * rect.height;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        keys.push(`${cell.x}|${cell.y}|${cell.z}`);
      }
    }
    return keys;
  }

  onWheel(event) {
    event.preventDefault();
    event.stopPropagation();
    const state = this.ctx.getState();
    const { api, renderer3d } = this.ctx;
    const cam = this.ctx.cam;
    const ownership =
      SCROLL_OWNERSHIP[state.tool] ||
      (state.tool === "none" ? SCROLL_OWNERSHIP.none : SCROLL_OWNERSHIP.default);
    const mod = event.altKey || event.ctrlKey || event.metaKey;
    const action = mod ? ownership.mod : ownership.plain;

    // Generate: all scroll = reroll until LMB exit or Esc (no slice/zoom).
    if (action === "reroll" || state.tool === "generate") {
      api.rerollShapeGen?.();
      const hover = this._generateHover || this._pendingGenerate;
      if (hover && api.shapeGen) {
        renderer3d.setPreviewCells(api.shapeGen.previewCellsAt(hover), state.colorHex);
      }
      return;
    }

    const zoomIntent = action === "zoom";
    if (typeof cam.handleWheel === "function") {
      cam.handleWheel(event, { zoom: zoomIntent });
      if (!zoomIntent) {
        const { grid } = this.ctx;
        cam.syncPivotToEditPlane?.(grid.axis, grid.slice);
      }
      return;
    }
    if (zoomIntent) {
      (cam.zoom || cam.dolly)?.(event.deltaY);
      return;
    }
    api.nudgeSlice(event.deltaY > 0 ? -1 : 1);
  }

  onKeyDown(event) {
    if (isEditableTarget(event.target)) return;

    const cam = this.ctx.cam;
    if (cam?.setMoveKey?.(event.code, true)) {
      event.preventDefault();
      return;
    }

    if (event.key === "Escape") {
      this._boxSelect = null;
      this._pendingGenerate = null;
      this._generateHover = null;
      if (this._boxSelectRaf) {
        cancelAnimationFrame(this._boxSelectRaf);
        this._boxSelectRaf = 0;
      }
      this.ctx.api.selection?.clear();
      this.ctx.api.setTool("none");
      this.ctx.renderer3d.clearPreviewCells?.();
      this.ctx.renderer3d.clearSelectDragPreview?.();
      event.preventDefault();
      return;
    }

    // Undo / Redo
    const mod = event.ctrlKey || event.metaKey;
    if (mod) {
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        this.ctx.api.undo?.();
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        this.ctx.api.redo?.();
        return;
      }
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      if (this.ctx.api.selection?.size()) {
        this.ctx.api.deleteSelection?.();
        event.preventDefault();
      }
      return;
    }

    // Slice ±1 on [ ] / , . (arrows move camera)
    const step = SLICE_KEYS[event.code];
    if (step != null) {
      event.preventDefault();
      this.ctx.api.nudgeSlice(step);
      const { grid } = this.ctx;
      this.ctx.cam.syncPivotToEditPlane?.(grid.axis, grid.slice);
    }
  }

  onKeyUp(event) {
    if (isEditableTarget(event.target)) {
      this.ctx.cam?.clearMoveKeys?.();
      return;
    }
    this.ctx.cam?.setMoveKey?.(event.code, false);
  }
}
