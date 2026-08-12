/**
 * Off-main-thread chunk meshing for Voxie3D.
 *
 * Default: full-cube instances. Greedy surface mesh when msg.mode === 'greedy'.
 */

import { buildGreedyMesh, parseHexLinear } from "./greedyMesh.js";
import { blockAtlasMeta } from "../materials/blockAtlasMeta.js";

const CELL = 1;
const ATLAS = blockAtlasMeta();

function packInstances(voxels, cell = CELL) {
  const n = voxels.length;
  const matrices = new Float32Array(n * 16);
  const colors = new Float32Array(n * 3);
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = voxels[i];
    keys[i] = `${v.x}|${v.y}|${v.z}`;
    const o = i * 16;
    matrices[o] = 1;
    matrices[o + 5] = 1;
    matrices[o + 10] = 1;
    matrices[o + 15] = 1;
    matrices[o + 12] = (v.x + 0.5) * cell;
    matrices[o + 13] = (v.y + 0.5) * cell;
    matrices[o + 14] = (v.z + 0.5) * cell;
    const [r, g, b] = parseHexLinear(v.color);
    const c = i * 3;
    colors[c] = r;
    colors[c + 1] = g;
    colors[c + 2] = b;
  }
  return { count: n, matrices, colors, keys, mode: "instances" };
}

function packGreedy(voxels, occExtra, cell = CELL) {
  const mesh = buildGreedyMesh(voxels, {
    cell,
    occExtra: occExtra || [],
    atlasIndex: ATLAS.materialKeyIndex,
    atlasSize: ATLAS.size,
    paintIndex: ATLAS.paintIndex ?? 0,
  });
  return mesh;
}

function transferablesFor(pack) {
  if (!pack) return [];
  if (pack.mode === "instances") {
    return [pack.matrices.buffer, pack.colors.buffer];
  }
  return [
    pack.positions.buffer,
    pack.normals.buffer,
    pack.colors.buffer,
    pack.uvs.buffer,
    pack.indices.buffer,
  ];
}

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type !== "build") return;

  const mode = msg.mode === "greedy" ? "greedy" : "instances";
  const cell = msg.cell ?? CELL;
  let solid;
  let ghost;
  if (mode === "greedy") {
    solid = packGreedy(msg.solid || [], msg.solidHalo || [], cell);
    ghost = packGreedy(msg.ghost || [], msg.ghostHalo || [], cell);
  } else {
    solid = packInstances(msg.solid || [], cell);
    ghost = packInstances(msg.ghost || [], cell);
  }

  self.postMessage(
    {
      type: "built",
      reqId: msg.reqId,
      chunkKey: msg.chunkKey,
      meshMode: mode,
      solid,
      ghost,
    },
    [...transferablesFor(solid), ...transferablesFor(ghost)]
  );
};
