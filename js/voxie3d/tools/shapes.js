/**
 * Shape tools — ghost preview then commit.
 * Extensible: register via SHAPE_BUILDERS.
 */

import { offsetOnPlane } from "./brushes.js";

/**
 * @typedef {'rect'|'diamond'|'line'} ShapeId
 */

/** Min diamond half-extent (manhattan) so it is visible. */
export const DIAMOND_MIN = 1;

/**
 * Plane-local (a,b) for a world cell relative to origin on axis.
 */
function toPlane(origin, cell, axis) {
  if (axis === "z") return { a: cell.x - origin.x, b: cell.y - origin.y };
  if (axis === "y") return { a: cell.x - origin.x, b: cell.z - origin.z };
  return { a: cell.y - origin.y, b: cell.z - origin.z };
}

function fromPlane(origin, a, b, axis) {
  return offsetOnPlane(origin.x, origin.y, origin.z, axis, a, b);
}

/** Bresenham line on plane. */
export function lineCells(origin, end, axis) {
  const o = toPlane(origin, origin, axis);
  const e = toPlane(origin, end, axis);
  let x0 = o.a;
  let y0 = o.b;
  const x1 = e.a;
  const y1 = e.b;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const out = [];
  for (;;) {
    out.push(fromPlane(origin, x0, y0, axis));
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/** Filled axis-aligned rect between two corners (inclusive). */
export function rectShapeCells(origin, end, axis) {
  const a0 = toPlane(origin, origin, axis);
  const a1 = toPlane(origin, end, axis);
  const minA = Math.min(a0.a, a1.a);
  const maxA = Math.max(a0.a, a1.a);
  const minB = Math.min(a0.b, a1.b);
  const maxB = Math.max(a0.b, a1.b);
  const out = [];
  for (let a = minA; a <= maxA; a++) {
    for (let b = minB; b <= maxB; b++) {
      out.push(fromPlane(origin, a, b, axis));
    }
  }
  return out;
}

/** Diamond (manhattan) filled; radius at least DIAMOND_MIN. */
export function diamondShapeCells(origin, end, axis) {
  const a0 = toPlane(origin, origin, axis);
  const a1 = toPlane(origin, end, axis);
  const r = Math.max(DIAMOND_MIN, Math.abs(a1.a - a0.a) + Math.abs(a1.b - a0.b));
  const out = [];
  for (let a = -r; a <= r; a++) {
    for (let b = -r; b <= r; b++) {
      if (Math.abs(a) + Math.abs(b) <= r) {
        out.push(fromPlane(origin, a0.a + a, a0.b + b, axis));
      }
    }
  }
  return out;
}

/** @type {Record<string, (origin:any, end:any, axis:string, opts?:object) => Array<{x:number,y:number,z:number}>>} */
export const SHAPE_BUILDERS = {
  rect: (o, e, axis) => rectShapeCells(o, e, axis),
  diamond: (o, e, axis) => diamondShapeCells(o, e, axis),
  line: (o, e, axis) => lineCells(o, e, axis),
};

export const SHAPE_IDS = Object.keys(SHAPE_BUILDERS);

/**
 * @param {ShapeId|string} kind
 * @param {{x:number,y:number,z:number}} origin
 * @param {{x:number,y:number,z:number}} end
 * @param {'x'|'y'|'z'} axis
 * @param {object} [opts]
 */
export function shapeCells(kind, origin, end, axis, opts) {
  const fn = SHAPE_BUILDERS[kind] || SHAPE_BUILDERS.rect;
  return fn(origin, end, axis, opts);
}
