/**
 * Leaf cluster — flattened noisy blob on the edit plane, slight z thickness.
 */

import { clampSize, density01, pushCell, rngFrom } from "../util.js";

/**
 * @param {{ seed: number, size?: number, density?: number }} params
 * @returns {{x:number,y:number,z:number,shade?:number}[]}
 */
export function generateLeaf(params) {
  const size = clampSize(params.size ?? 6);
  const dens = density01(params.density ?? 65);
  const rng = rngFrom(params.seed, "leaf", size, params.density | 0);
  /** @type {{x:number,y:number,z:number,shade?:number}[]} */
  const out = [];

  const r = Math.max(2, Math.round(size * 0.65));
  const thick = Math.max(1, Math.round(size / 5));
  const clusters = 2 + rng.int(3);

  for (let k = 0; k < clusters; k++) {
    const cx = rng.int(r * 2 + 1) - r;
    const cy = rng.int(r * 2 + 1) - r;
    const cr = Math.max(1, Math.round(r * rng.range(0.35, 0.7)));
    for (let x = -cr; x <= cr; x++) {
      for (let y = -cr; y <= cr; y++) {
        const d2 = x * x + y * y;
        if (d2 > cr * cr * rng.range(0.75, 1.15)) continue;
        if (rng.next() > dens) continue;
        const z = rng.int(thick + 1);
        const shade = 0.8 + rng.range(-0.12, 0.18);
        pushCell(out, cx + x, cy + y, z, shade);
      }
    }
  }

  return out;
}
