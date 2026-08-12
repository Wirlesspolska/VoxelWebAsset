/**
 * Wall segment — thin vertical slab with light irregularity.
 */

import { clampSize, density01, pushCell, rngFrom } from "../util.js";

/**
 * @param {{ seed: number, size?: number, density?: number }} params
 * @returns {{x:number,y:number,z:number,shade?:number}[]}
 */
export function generateWall(params) {
  const size = clampSize(params.size ?? 6);
  const dens = density01(params.density ?? 90);
  const rng = rngFrom(params.seed, "wall", size, params.density | 0);
  /** @type {{x:number,y:number,z:number,shade?:number}[]} */
  const out = [];

  const length = Math.max(3, size + 1);
  const height = Math.max(2, Math.round(size * 0.85));
  const thick = size >= 8 ? 2 : 1;
  // Random orientation on XY plane
  const alongX = rng.chance(0.5);

  for (let i = 0; i < length; i++) {
    for (let z = 0; z < height; z++) {
      for (let t = 0; t < thick; t++) {
        if (rng.next() > dens * 0.95 + 0.05) continue;
        // Occasional missing top crenellation
        if (z === height - 1 && rng.chance(0.22)) continue;
        const shade = 0.78 + (z / Math.max(1, height - 1)) * 0.22 + rng.range(-0.04, 0.04);
        if (alongX) pushCell(out, i - ((length / 2) | 0), t, z, shade);
        else pushCell(out, t, i - ((length / 2) | 0), z, shade);
      }
    }
  }

  // Small buttress / pier bump
  if (rng.chance(0.45)) {
    const mid = 0;
    const pierH = Math.max(1, (height / 2) | 0);
    for (let z = 0; z < pierH; z++) {
      if (alongX) pushCell(out, mid, thick, z, 0.72);
      else pushCell(out, thick, mid, z, 0.72);
    }
  }

  return out;
}
