/**
 * Length stroke — place a run of N blocks along ±X/±Y/±Z with optional smooth stair.
 */

export const STROKE_DIRS = [
  { id: "+x", axis: "x", sign: 1, label: "+X" },
  { id: "-x", axis: "x", sign: -1, label: "−X" },
  { id: "+y", axis: "y", sign: 1, label: "+Y" },
  { id: "-y", axis: "y", sign: -1, label: "−Y" },
  { id: "+z", axis: "z", sign: 1, label: "+Z" },
  { id: "-z", axis: "z", sign: -1, label: "−Z" },
];

/**
 * Straight run of `length` cells including the anchor.
 * @param {{x:number,y:number,z:number}} anchor
 * @param {{axis:string,sign:number}} dir
 * @param {number} length
 */
export function strokeCellsStraight(anchor, dir, length) {
  const n = Math.max(1, length | 0);
  const cells = [];
  for (let i = 0; i < n; i++) {
    cells.push({
      x: anchor.x + (dir.axis === "x" ? dir.sign * i : 0),
      y: anchor.y + (dir.axis === "y" ? dir.sign * i : 0),
      z: anchor.z + (dir.axis === "z" ? dir.sign * i : 0),
    });
  }
  return cells;
}

/**
 * Smooth / stair: primary step every cell; every other step also nudges a secondary axis
 * so diagonals read as stairs (simple averaged preview).
 * @param {{x:number,y:number,z:number}} anchor
 * @param {{axis:string,sign:number}} dir
 * @param {number} length
 * @param {{axis:string,sign:number}|null} [secondary]
 */
export function strokeCellsSmooth(anchor, dir, length, secondary = null) {
  if (!secondary || secondary.axis === dir.axis) {
    return strokeCellsStraight(anchor, dir, length);
  }
  const n = Math.max(1, length | 0);
  const cells = [];
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < n; i++) {
    if (dir.axis === "x") sx += dir.sign;
    else if (dir.axis === "y") sy += dir.sign;
    else sz += dir.sign;
    if (i > 0 && i % 2 === 0) {
      if (secondary.axis === "x") sx += secondary.sign;
      else if (secondary.axis === "y") sy += secondary.sign;
      else sz += secondary.sign;
    }
    cells.push({
      x: anchor.x + sx - (dir.axis === "x" ? dir.sign : 0),
      y: anchor.y + sy - (dir.axis === "y" ? dir.sign : 0),
      z: anchor.z + sz - (dir.axis === "z" ? dir.sign : 0),
    });
    // Rebuild absolute from i for clarity
    cells[cells.length - 1] = {
      x: anchor.x + (dir.axis === "x" ? dir.sign * i : 0) + (secondary.axis === "x" ? secondary.sign * Math.floor(i / 2) : 0),
      y: anchor.y + (dir.axis === "y" ? dir.sign * i : 0) + (secondary.axis === "y" ? secondary.sign * Math.floor(i / 2) : 0),
      z: anchor.z + (dir.axis === "z" ? dir.sign * i : 0) + (secondary.axis === "z" ? secondary.sign * Math.floor(i / 2) : 0),
    };
  }
  return cells;
}

/**
 * All six direction ghosts from an anchor (for prerender).
 * @param {{x:number,y:number,z:number}} anchor
 * @param {number} length
 * @param {boolean} [smooth]
 */
export function strokeDirectionGhosts(anchor, length, smooth = false) {
  return STROKE_DIRS.map((d) => {
    const secondary = smooth
      ? STROKE_DIRS.find((x) => x.axis !== d.axis && x.sign === 1) || null
      : null;
    const cells = smooth
      ? strokeCellsSmooth(anchor, d, length, secondary)
      : strokeCellsStraight(anchor, d, length);
    return { dir: d, cells };
  });
}

/**
 * Pick nearest direction from a hover cell relative to anchor.
 * @param {{x:number,y:number,z:number}} anchor
 * @param {{x:number,y:number,z:number}} hover
 */
export function pickStrokeDirection(anchor, hover) {
  const dx = (hover.x | 0) - (anchor.x | 0);
  const dy = (hover.y | 0) - (anchor.y | 0);
  const dz = (hover.z | 0) - (anchor.z | 0);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  if (ax >= ay && ax >= az && ax > 0) {
    return STROKE_DIRS.find((d) => d.axis === "x" && d.sign === Math.sign(dx));
  }
  if (ay >= ax && ay >= az && ay > 0) {
    return STROKE_DIRS.find((d) => d.axis === "y" && d.sign === Math.sign(dy));
  }
  if (az > 0) {
    return STROKE_DIRS.find((d) => d.axis === "z" && d.sign === Math.sign(dz));
  }
  return STROKE_DIRS[0];
}

export function normalizeStrokeLength(n, fallback = 5) {
  const v = Number.isFinite(n) ? n | 0 : fallback;
  return Math.max(1, Math.min(64, v));
}
