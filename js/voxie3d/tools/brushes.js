/**
 * Modern brush footprints on the edit plane.
 * Presets: 1×1, 2×2, 2×1, 3×4 + custom W×H + filled circle.
 */

export const BRUSH_PRESETS = [
  { id: "1x1", label: "1×1", w: 1, h: 1 },
  { id: "2x2", label: "2×2", w: 2, h: 2 },
  { id: "2x1", label: "2×1", w: 2, h: 1 },
  { id: "3x4", label: "3×4", w: 3, h: 4 },
];

/**
 * Map (a,b) plane offsets onto world cells for the active edit axis.
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {'x'|'y'|'z'} axis
 * @param {number} da  first plane axis offset
 * @param {number} db  second plane axis offset
 */
export function offsetOnPlane(cx, cy, cz, axis, da, db) {
  const c = { x: cx, y: cy, z: cz };
  if (axis === "z") {
    c.x += da;
    c.y += db;
  } else if (axis === "y") {
    c.x += da;
    c.z += db;
  } else {
    c.y += da;
    c.z += db;
  }
  return c;
}

/**
 * Axis-aligned rect brush anchored at click (grows +a/+b from origin).
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {'x'|'y'|'z'} axis
 * @param {number} w
 * @param {number} h
 */
export function rectBrushCells(cx, cy, cz, axis, w, h) {
  const ww = Math.max(1, w | 0);
  const hh = Math.max(1, h | 0);
  const cells = [];
  for (let a = 0; a < ww; a++) {
    for (let b = 0; b < hh; b++) {
      cells.push(offsetOnPlane(cx, cy, cz, axis, a, b));
    }
  }
  return cells;
}

/**
 * Filled circle on the edit plane. radius 4 ≈ diameter 9 footprint.
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {'x'|'y'|'z'} axis
 * @param {number} radius
 */
export function circleBrushCells(cx, cy, cz, axis, radius) {
  const r = Math.max(1, radius | 0);
  const cells = [];
  const r2 = r * r;
  for (let a = -r; a <= r; a++) {
    for (let b = -r; b <= r; b++) {
      if (a * a + b * b <= r2) {
        cells.push(offsetOnPlane(cx, cy, cz, axis, a, b));
      }
    }
  }
  return cells;
}

/**
 * Resolve brush cells from paint state.
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {'x'|'y'|'z'} axis
 * @param {{ brushShape?: string, brushW?: number, brushH?: number, circleRadius?: number, brushSize?: number }} brush
 */
export function paintBrushCells(cx, cy, cz, axis, brush = {}) {
  if (brush.brushShape === "circle") {
    return circleBrushCells(cx, cy, cz, axis, brush.circleRadius ?? 4);
  }
  const w = Math.max(1, brush.brushW || brush.brushSize || 1);
  const h = Math.max(1, brush.brushH || brush.brushSize || 1);
  return rectBrushCells(cx, cy, cz, axis, w, h);
}

/** Legacy adapter: size 1 → 1×1, size 3 → 3×3. */
export function brushCells(cx, cy, cz, axis, brushSize) {
  const n = brushSize >= 3 ? 3 : 1;
  if (n === 1) return [{ x: cx, y: cy, z: cz }];
  return rectBrushCells(cx - 1, cy, cz, axis, 3, 3);
}
