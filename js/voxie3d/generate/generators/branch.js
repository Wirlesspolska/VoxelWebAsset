/**
 * Procedural branch / twig stamp — tapered polyline with light thickness.
 */

import { clampSize, density01, pushCell, rngFrom } from "../util.js";

/**
 * @param {{ seed: number, size?: number, density?: number }} params
 * @returns {{x:number,y:number,z:number,shade?:number}[]}
 */
export function generateBranch(params) {
  const size = clampSize(params.size ?? 6);
  const dens = density01(params.density ?? 70);
  const rng = rngFrom(params.seed, "branch", size, params.density | 0);
  /** @type {{x:number,y:number,z:number,shade?:number}[]} */
  const out = [];

  // Grow mostly upward (+z) with a slight lean in xy.
  let x = 0;
  let y = 0;
  let z = 0;
  let dx = rng.range(-0.35, 0.35);
  let dy = rng.range(-0.35, 0.35);
  const len = Math.max(3, size + rng.int(3));
  const baseR = Math.max(1, Math.round(size / 5));

  for (let i = 0; i < len; i++) {
    const t = i / Math.max(1, len - 1);
    const r = Math.max(0, Math.round(baseR * (1 - t * 0.85)));
    const shade = 0.75 + t * 0.35 + rng.range(-0.05, 0.05);
    for (let ox = -r; ox <= r; ox++) {
      for (let oy = -r; oy <= r; oy++) {
        if (ox * ox + oy * oy > r * r + 0.25) continue;
        if (rng.next() > dens * 0.95 + 0.05) continue;
        pushCell(out, Math.round(x) + ox, Math.round(y) + oy, Math.round(z), shade);
      }
    }
    dx += rng.range(-0.25, 0.25);
    dy += rng.range(-0.25, 0.25);
    dx *= 0.92;
    dy *= 0.92;
    x += dx;
    y += dy;
    z += 0.85 + rng.range(0, 0.35);
    // Occasional short side spur
    if (i > 1 && i < len - 1 && rng.chance(0.28)) {
      const sx = Math.round(x);
      const sy = Math.round(y);
      const sz = Math.round(z);
      const sdx = rng.pick([-1, 1]);
      const sdy = rng.pick([-1, 0, 1]);
      const spur = 1 + rng.int(Math.max(1, (size / 3) | 0));
      for (let s = 1; s <= spur; s++) {
        pushCell(out, sx + sdx * s, sy + sdy * s, sz + (rng.chance(0.4) ? 1 : 0), 0.85);
      }
    }
  }

  return out;
}
