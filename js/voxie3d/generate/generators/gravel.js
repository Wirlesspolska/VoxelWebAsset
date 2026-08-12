/**
 * Gravel patch — sparse small pebbles scattered on the plane.
 */

import { clampSize, density01, pushCell, rngFrom } from "../util.js";

/**
 * @param {{ seed: number, size?: number, density?: number }} params
 * @returns {{x:number,y:number,z:number,shade?:number}[]}
 */
export function generateGravel(params) {
  const size = clampSize(params.size ?? 6);
  const dens = density01(params.density ?? 45);
  const rng = rngFrom(params.seed, "gravel", size, params.density | 0);
  /** @type {{x:number,y:number,z:number,shade?:number}[]} */
  const out = [];

  const half = Math.max(2, Math.round(size * 0.7));
  const pebbles = Math.max(4, Math.round(half * half * dens * 1.4));

  for (let i = 0; i < pebbles; i++) {
    const x = rng.int(half * 2 + 1) - half;
    const y = rng.int(half * 2 + 1) - half;
    if (x * x + y * y > half * half + 1) continue;
    const pr = rng.chance(0.25) ? 1 : 0;
    const shade = 0.65 + rng.range(0, 0.4);
    for (let ox = -pr; ox <= pr; ox++) {
      for (let oy = -pr; oy <= pr; oy++) {
        if (pr && ox * ox + oy * oy > 1) continue;
        if (rng.next() > 0.85) continue;
        const z = rng.chance(0.2) ? 1 : 0;
        pushCell(out, x + ox, y + oy, z, shade + rng.range(-0.05, 0.05));
      }
    }
  }

  return out;
}
