/**
 * Deterministic RNG for world/terrain.
 * Algorithm matches js/roguelike/rng.js (mulberry32 + FNV-ish hashSeed)
 * so seeds can be shared with floor gen later.
 * Clarification: arena/roguelike runtime now lives in FIRST_GAME/ARENA_PART_MACHINE/.
 */

/** Mulberry32 — deterministic RNG from seed. */
export function createRng(seed) {
  let s = seed >>> 0;
  if (!s) s = 1;
  function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    int(max) {
      return Math.floor(next() * max);
    },
    range(a, b) {
      return a + next() * (b - a);
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}

export function hashSeed(...parts) {
  let h = 2166136261;
  const str = parts.join(":");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

