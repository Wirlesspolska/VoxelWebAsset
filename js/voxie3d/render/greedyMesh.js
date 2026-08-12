/**
 * Surface-only greedy meshing for voxel chunks.
 *
 * - Face culling: emit only faces with no solid neighbor
 * - Greedy merge: coplanar quads sharing the same material key
 * - Fewer triangles + less GPU upload than full-cube instancing
 *
 * Pure / transferable — safe in a Worker (no Three.js).
 */

const CELL = 1;

/** Face axis: 0=X, 1=Y, 2=Z. dir: +1 or -1. */
const FACES = Object.freeze([
  { axis: 0, dir: -1, nx: -1, ny: 0, nz: 0 },
  { axis: 0, dir: 1, nx: 1, ny: 0, nz: 0 },
  { axis: 1, dir: -1, nx: 0, ny: -1, nz: 0 },
  { axis: 1, dir: 1, nx: 0, ny: 1, nz: 0 },
  { axis: 2, dir: -1, nx: 0, ny: 0, nz: -1 },
  { axis: 2, dir: 1, nx: 0, ny: 0, nz: 1 },
]);

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Parse #rgb/#rrggbb → linear RGB 0–1. */
export function parseHexLinear(hex) {
  const s = typeof hex === "string" ? hex.trim() : "";
  const h = s.charAt(0) === "#" ? s.slice(1) : s;
  const full = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return [0.5, 0.5, 0.5];
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function cellKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

/**
 * Material merge key: prefer explicit block/texture id, else color hex.
 * @param {{ color?: string, block?: string, mat?: string }} v
 */
export function materialKeyOf(v) {
  if (v?.block) return `b:${v.block}`;
  if (v?.mat) return `m:${v.mat}`;
  const c = typeof v?.color === "string" ? v.color.trim().toLowerCase() : "#888888";
  return `c:${c.startsWith("#") ? c : `#${c}`}`;
}

/**
 * @typedef {object} GreedyMeshResult
 * @property {number} count voxel count (for LOD budgets / picking keys)
 * @property {string[]} keys voxel keys in input order
 * @property {Float32Array} positions
 * @property {Float32Array} normals
 * @property {Float32Array} colors
 * @property {Float32Array} uvs
 * @property {Uint32Array} indices
 * @property {number} quadCount
 * @property {number} vertexCount
 * @property {'greedy'} mode
 */

/**
 * Build a greedy surface mesh for a list of solid voxels.
 *
 * @param {Array<{x:number,y:number,z:number,color?:string,block?:string,mat?:string}>} voxels
 * @param {object} [opts]
 * @param {number} [opts.cell=1]
 * @param {Iterable<string>|Set<string>|string[]} [opts.occExtra] neighbor occupancy keys "x|y|z"
 * @param {(v:object)=>string} [opts.materialKey]
 * @param {Record<string, number>} [opts.atlasIndex] materialKey → atlas tile index (0..n)
 * @param {number} [opts.atlasSize=1] tiles per axis (atlas is atlasSize²)
 * @returns {GreedyMeshResult}
 */
export function buildGreedyMesh(voxels, opts = {}) {
  const cell = opts.cell ?? CELL;
  const matKeyFn = opts.materialKey || materialKeyOf;
  const atlasIndex = opts.atlasIndex || null;
  const atlasSize = Math.max(1, opts.atlasSize | 0 || 1);
  const tile = 1 / atlasSize;

  /** @type {Map<string, {x:number,y:number,z:number,color?:string,block?:string,mat?:string, mk:string}>} */
  const map = new Map();
  const keys = new Array(voxels.length);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    const k = cellKey(v.x, v.y, v.z);
    keys[i] = k;
    map.set(k, { ...v, mk: matKeyFn(v) });
  }

  const occ = new Set(map.keys());
  if (opts.occExtra) {
    for (const k of opts.occExtra) occ.add(k);
  }

  function solidAt(x, y, z) {
    return occ.has(cellKey(x, y, z));
  }

  // Growable buffers (quads → 4 verts each).
  let cap = Math.max(64, voxels.length * 2);
  let positions = new Float32Array(cap * 4 * 3);
  let normals = new Float32Array(cap * 4 * 3);
  let colors = new Float32Array(cap * 4 * 3);
  let uvs = new Float32Array(cap * 4 * 2);
  let indices = new Uint32Array(cap * 6);
  let quadCount = 0;
  let vertCount = 0;
  let indexCount = 0;

  function ensure(extraQuads) {
    if (quadCount + extraQuads <= cap) return;
    while (cap < quadCount + extraQuads) cap = (cap * 1.5) | 0;
    const np = new Float32Array(cap * 4 * 3);
    const nn = new Float32Array(cap * 4 * 3);
    const nc = new Float32Array(cap * 4 * 3);
    const nu = new Float32Array(cap * 4 * 2);
    const ni = new Uint32Array(cap * 6);
    np.set(positions);
    nn.set(normals);
    nc.set(colors);
    nu.set(uvs);
    ni.set(indices);
    positions = np;
    normals = nn;
    colors = nc;
    uvs = nu;
    indices = ni;
  }

  function emitQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, rgb, tileIdx) {
    ensure(1);
    const base = vertCount;
    const po = base * 3;
    const uo = base * 2;
    // Winding: v0→v1→v2→v3 (CCW when viewed along +normal).
    positions[po] = x0 * cell;
    positions[po + 1] = y0 * cell;
    positions[po + 2] = z0 * cell;
    positions[po + 3] = x1 * cell;
    positions[po + 4] = y1 * cell;
    positions[po + 5] = z1 * cell;
    positions[po + 6] = x2 * cell;
    positions[po + 7] = y2 * cell;
    positions[po + 8] = z2 * cell;
    positions[po + 9] = x3 * cell;
    positions[po + 10] = y3 * cell;
    positions[po + 11] = z3 * cell;

    for (let i = 0; i < 4; i++) {
      const o = (base + i) * 3;
      normals[o] = nx;
      normals[o + 1] = ny;
      normals[o + 2] = nz;
      colors[o] = rgb[0];
      colors[o + 1] = rgb[1];
      colors[o + 2] = rgb[2];
    }

    const col = tileIdx % atlasSize;
    const row = Math.floor(tileIdx / atlasSize) % atlasSize;
    const u0 = col * tile;
    const v0 = 1 - (row + 1) * tile;
    const u1 = u0 + tile;
    const v1 = v0 + tile;
    // Quad UV: stretch one tile across the merged face.
    uvs[uo] = u0;
    uvs[uo + 1] = v0;
    uvs[uo + 2] = u1;
    uvs[uo + 3] = v0;
    uvs[uo + 4] = u1;
    uvs[uo + 5] = v1;
    uvs[uo + 6] = u0;
    uvs[uo + 7] = v1;

    const io = indexCount;
    indices[io] = base;
    indices[io + 1] = base + 1;
    indices[io + 2] = base + 2;
    indices[io + 3] = base;
    indices[io + 4] = base + 2;
    indices[io + 5] = base + 3;

    vertCount += 4;
    indexCount += 6;
    quadCount += 1;
  }

  // Bounds of voxels in this chunk (not halo).
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const v of map.values()) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  if (!Number.isFinite(minX)) {
    return {
      count: 0,
      keys,
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      colors: new Float32Array(0),
      uvs: new Float32Array(0),
      indices: new Uint32Array(0),
      quadCount: 0,
      vertexCount: 0,
      mode: "greedy",
    };
  }

  // Pad one cell so masks cover outer faces.
  const x0 = minX;
  const y0 = minY;
  const z0 = minZ;
  const dimX = maxX - minX + 1;
  const dimY = maxY - minY + 1;
  const dimZ = maxZ - minZ + 1;

  for (const face of FACES) {
    const { axis, dir, nx, ny, nz } = face;
    const uAxis = axis === 0 ? 1 : 0;
    const vAxis = axis === 2 ? 1 : 2;
    const dims = [dimX, dimY, dimZ];
    const dU = dims[uAxis];
    const dV = dims[vAxis];
    const dSlice = dims[axis];

    for (let slice = 0; slice < dSlice; slice++) {
      /** @type {(string|null)[]} */
      const mask = new Array(dU * dV);
      /** @type {(number[]|null)[]} */
      const rgbMask = new Array(dU * dV);
      mask.fill(null);
      rgbMask.fill(null);

      for (let v = 0; v < dV; v++) {
        for (let u = 0; u < dU; u++) {
          const pos = [0, 0, 0];
          pos[uAxis] = (uAxis === 0 ? x0 : uAxis === 1 ? y0 : z0) + u;
          pos[vAxis] = (vAxis === 0 ? x0 : vAxis === 1 ? y0 : z0) + v;
          pos[axis] = (axis === 0 ? x0 : axis === 1 ? y0 : z0) + slice;

          const [px, py, pz] = pos;
          const voxel = map.get(cellKey(px, py, pz));
          if (!voxel) continue;

          const npos = [px, py, pz];
          npos[axis] += dir;
          if (solidAt(npos[0], npos[1], npos[2])) continue;

          const mi = v * dU + u;
          mask[mi] = voxel.mk;
          rgbMask[mi] = parseHexLinear(voxel.color || "#888888");
        }
      }

      // Greedy merge mask into rectangles.
      for (let v = 0; v < dV; v++) {
        for (let u = 0; u < dU; ) {
          const mi = v * dU + u;
          const mk = mask[mi];
          if (!mk) {
            u++;
            continue;
          }
          const rgb = rgbMask[mi];

          let w = 1;
          while (u + w < dU && mask[mi + w] === mk) w++;

          let h = 1;
          outer: while (v + h < dV) {
            for (let k = 0; k < w; k++) {
              if (mask[(v + h) * dU + u + k] !== mk) break outer;
            }
            h++;
          }

          for (let dv = 0; dv < h; dv++) {
            for (let du = 0; du < w; du++) {
              const ii = (v + dv) * dU + u + du;
              mask[ii] = null;
              rgbMask[ii] = null;
            }
          }

          // Corner positions in voxel units (face at cell boundary).
          const origin = [0, 0, 0];
          origin[uAxis] = (uAxis === 0 ? x0 : uAxis === 1 ? y0 : z0) + u;
          origin[vAxis] = (vAxis === 0 ? x0 : vAxis === 1 ? y0 : z0) + v;
          origin[axis] = (axis === 0 ? x0 : axis === 1 ? y0 : z0) + slice + (dir > 0 ? 1 : 0);

          const duVec = [0, 0, 0];
          const dvVec = [0, 0, 0];
          duVec[uAxis] = w;
          dvVec[vAxis] = h;

          // Quad corners — flip winding for -dir so normals face outward.
          let c0;
          let c1;
          let c2;
          let c3;
          if (dir > 0) {
            c0 = origin;
            c1 = [origin[0] + duVec[0], origin[1] + duVec[1], origin[2] + duVec[2]];
            c2 = [
              origin[0] + duVec[0] + dvVec[0],
              origin[1] + duVec[1] + dvVec[1],
              origin[2] + duVec[2] + dvVec[2],
            ];
            c3 = [origin[0] + dvVec[0], origin[1] + dvVec[1], origin[2] + dvVec[2]];
          } else {
            c0 = origin;
            c1 = [origin[0] + dvVec[0], origin[1] + dvVec[1], origin[2] + dvVec[2]];
            c2 = [
              origin[0] + duVec[0] + dvVec[0],
              origin[1] + duVec[1] + dvVec[1],
              origin[2] + duVec[2] + dvVec[2],
            ];
            c3 = [origin[0] + duVec[0], origin[1] + duVec[1], origin[2] + duVec[2]];
          }

          let tileIdx = opts.paintIndex ?? 0;
          if (atlasIndex && mk in atlasIndex) tileIdx = atlasIndex[mk] | 0;
          emitQuad(
            c0[0],
            c0[1],
            c0[2],
            c1[0],
            c1[1],
            c1[2],
            c2[0],
            c2[1],
            c2[2],
            c3[0],
            c3[1],
            c3[2],
            nx,
            ny,
            nz,
            rgb,
            tileIdx
          );

          u += w;
        }
      }
    }
  }

  return {
    count: voxels.length,
    keys,
    positions: positions.subarray(0, vertCount * 3),
    normals: normals.subarray(0, vertCount * 3),
    colors: colors.subarray(0, vertCount * 3),
    uvs: uvs.subarray(0, vertCount * 2),
    indices: indices.subarray(0, indexCount),
    quadCount,
    vertexCount: vertCount,
    mode: "greedy",
  };
}

/**
 * Collect occupancy keys for the 1-cell halo around a chunk AABB.
 * @param {(x:number,y:number,z:number)=>boolean} hasSolid
 * @param {{x0:number,y0:number,z0:number,x1:number,y1:number,z1:number}} box inclusive min, exclusive max
 * @returns {string[]}
 */
export function collectHaloOccupancy(hasSolid, box) {
  const { x0, y0, z0, x1, y1, z1 } = box;
  /** @type {string[]} */
  const out = [];
  // Six faces of the AABB, one cell thick outside.
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      if (hasSolid(x0 - 1, y, z)) out.push(cellKey(x0 - 1, y, z));
      if (hasSolid(x1, y, z)) out.push(cellKey(x1, y, z));
    }
  }
  for (let x = x0; x < x1; x++) {
    for (let z = z0; z < z1; z++) {
      if (hasSolid(x, y0 - 1, z)) out.push(cellKey(x, y0 - 1, z));
      if (hasSolid(x, y1, z)) out.push(cellKey(x, y1, z));
    }
  }
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) {
      if (hasSolid(x, y, z0 - 1)) out.push(cellKey(x, y, z0 - 1));
      if (hasSolid(x, y, z1)) out.push(cellKey(x, y, z1));
    }
  }
  return out;
}

export { FACES, CELL as GREEDY_CELL };
