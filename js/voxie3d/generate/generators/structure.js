/**
 * Foundation + floors stub — wide deep base, smaller stepped upper floors.
 * “Lay deep foundation” via foundationDepth (cells below the click plane).
 */

import { clampSize, density01, pushCell, rngFrom } from "../util.js";

/**
 * @param {{ seed: number, size?: number, density?: number, foundationDepth?: number }} params
 * @returns {{x:number,y:number,z:number,shade?:number}[]}
 */
export function generateStructure(params) {
  const size = clampSize(params.size ?? 6);
  const dens = density01(params.density ?? 85);
  const depth = Math.max(1, Math.min(6, (params.foundationDepth ?? 2) | 0));
  const rng = rngFrom(params.seed, "structure", size, depth, params.density | 0);
  /** @type {{x:number,y:number,z:number,shade?:number}[]} */
  const out = [];

  const baseW = Math.max(3, size);
  const baseH = Math.max(3, size - (size > 6 ? 1 : 0));
  // Floors above ground (z>=0); foundation at z < 0
  const floors = Math.max(1, Math.min(3, 1 + ((size / 4) | 0)));
  const floorH = Math.max(2, Math.min(4, 2 + ((size / 5) | 0)));

  // Deep foundation slab (wider than first floor)
  const fw = baseW + 2;
  const fh = baseH + 2;
  const fwx = (fw / 2) | 0;
  const fhy = (fh / 2) | 0;
  for (let z = -depth; z < 0; z++) {
    for (let x = -fwx; x <= fwx; x++) {
      for (let y = -fhy; y <= fhy; y++) {
        const edge = Math.abs(x) === fwx || Math.abs(y) === fhy || z === -depth;
        if (!edge && rng.chance(0.35)) continue; // hollow-ish fill
        if (rng.next() > dens * 0.9 + 0.1) continue;
        pushCell(out, x, y, z, 0.55 + (depth + z) * 0.06);
      }
    }
  }

  // Stack shrinking floors
  for (let f = 0; f < floors; f++) {
    const shrink = f * 2;
    const w = Math.max(2, baseW - shrink);
    const h = Math.max(2, baseH - shrink);
    const wx = (w / 2) | 0;
    const hy = (h / 2) | 0;
    const z0 = f * floorH;
    for (let z = z0; z < z0 + floorH; z++) {
      for (let x = -wx; x <= wx; x++) {
        for (let y = -hy; y <= hy; y++) {
          const wall =
            Math.abs(x) === wx ||
            Math.abs(y) === hy ||
            z === z0 ||
            z === z0 + floorH - 1;
          if (!wall) continue;
          if (rng.next() > dens * 0.92 + 0.08) continue;
          // Window gaps on mid floors
          if (
            f > 0 &&
            z > z0 &&
            z < z0 + floorH - 1 &&
            (Math.abs(x) === wx || Math.abs(y) === hy) &&
            rng.chance(0.18)
          ) {
            continue;
          }
          const shade = 0.78 + f * 0.06 + (z - z0) * 0.03;
          pushCell(out, x, y, z, shade);
        }
      }
    }
  }

  // Pillar stub option when size is large
  if (size >= 7 && rng.chance(0.5)) {
    const px = rng.pick([-((baseW / 2) | 0) - 1, ((baseW / 2) | 0) + 1]);
    const py = rng.pick([-((baseH / 2) | 0), 0, ((baseH / 2) | 0)]);
    const ph = floors * floorH;
    for (let z = -Math.min(2, depth); z < ph; z++) {
      pushCell(out, px, py, z, 0.7);
      if (size >= 9) pushCell(out, px, py + (py >= 0 ? -1 : 1), z, 0.68);
    }
  }

  return out;
}

/** Thin vertical column with optional buried footing. */
export function generatePillar(params) {
  const size = clampSize(params.size ?? 6);
  const dens = density01(params.density ?? 90);
  const depth = Math.max(0, Math.min(4, (params.foundationDepth ?? 1) | 0));
  const rng = rngFrom(params.seed, "pillar", size, depth, params.density | 0);
  /** @type {{x:number,y:number,z:number,shade?:number}[]} */
  const out = [];
  const h = Math.max(3, size + 1);
  const r = size >= 8 ? 1 : 0;
  for (let z = -depth; z < h; z++) {
    for (let x = -r; x <= r; x++) {
      for (let y = -r; y <= r; y++) {
        if (r && x * x + y * y > r * r) continue;
        if (rng.next() > dens * 0.95 + 0.05) continue;
        const shade = z < 0 ? 0.6 : 0.75 + (z / h) * 0.2;
        pushCell(out, x, y, z, shade);
      }
    }
  }
  // Capital flare
  if (rng.chance(0.7)) {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        if (Math.abs(x) + Math.abs(y) === 2 && rng.chance(0.4)) continue;
        pushCell(out, x, y, h - 1, 0.9);
      }
    }
  }
  return out;
}
