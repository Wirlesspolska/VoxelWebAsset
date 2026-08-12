/**
 * Procedural stone / rock blob — ellipsoidal core with noisy shell.
 */

import { clampSize, density01, pushCell, rngFrom } from "../util.js";

/**
 * @param {{ seed: number, size?: number, density?: number }} params
 * @returns {{x:number,y:number,z:number,shade?:number}[]}
 */
export function generateRock(params) {
  const size = clampSize(params.size ?? 6);
  const dens = density01(params.density ?? 80);
  const rng = rngFrom(params.seed, "rock", size, params.density | 0);
  /** @type {{x:number,y:number,z:number,shade?:number}[]} */
  const out = [];

  const rx = Math.max(1, Math.round(size * rng.range(0.35, 0.55)));
  const ry = Math.max(1, Math.round(size * rng.range(0.35, 0.55)));
  const rz = Math.max(1, Math.round(size * rng.range(0.28, 0.48)));
  const stretch = {
    x: rng.range(0.75, 1.25),
    y: rng.range(0.75, 1.25),
    z: rng.range(0.7, 1.15),
  };

  for (let x = -rx; x <= rx; x++) {
    for (let y = -ry; y <= ry; y++) {
      for (let z = -rz; z <= rz; z++) {
        const nx = x / (rx * stretch.x);
        const ny = y / (ry * stretch.y);
        const nz = z / (rz * stretch.z);
        const d = nx * nx + ny * ny + nz * nz;
        const noise = rng.range(-0.22, 0.18);
        if (d > 1 + noise) continue;
        if (rng.next() > dens * 0.9 + 0.1) continue;
        const shade = 0.7 + (1 - Math.min(1, d)) * 0.35 + rng.range(-0.06, 0.06);
        pushCell(out, x, y, z, shade);
      }
    }
  }

  // Sit rock mostly on / above the click plane (raise by half height).
  const lift = Math.max(0, rz - 1);
  for (const c of out) c.z += lift;
  return out;
}
