/**
 * Tiny character previews scaled to the block world.
 * Height ≈ characterHeightBlocks × CELL — pawns adjust to the cubic world.
 */

import * as THREE from "three";
import { CELL } from "../render/VoxelRenderer.js";

const DEFAULT_COLORS = ["#c4e070", "#70c4e0", "#e0a070", "#d070c4", "#e0d070"];

/**
 * @param {import('three').Scene} scene
 * @param {import('../core/VoxelGrid.js').VoxelGrid} grid
 * @param {object} [opts]
 * @param {number} [opts.count=4]
 * @param {number} [opts.heightBlocks=2]
 * @param {boolean} [opts.walk=true]
 * @param {string[]} [opts.colors]
 */
export function createWorldPawns(scene, grid, opts = {}) {
  const group = new THREE.Group();
  group.name = "voxie3d-pawns";
  scene.add(group);

  let heightBlocks = Math.max(0.75, opts.heightBlocks ?? 2);
  const count = Math.max(0, Math.min(12, opts.count ?? 4));
  const walk = opts.walk !== false;
  const colors = Array.isArray(opts.colors) && opts.colors.length ? opts.colors : DEFAULT_COLORS;

  /** @type {Array<{root:THREE.Group, body:THREE.Mesh, head:THREE.Mesh, x:number, z:number, phase:number, speed:number, heading:number, bob:number}>} */
  const pawns = [];

  function bodyDims() {
    // Character occupies ~N blocks tall; footprint ~0.45 of a block.
    const h = heightBlocks * CELL;
    const r = CELL * 0.22;
    return { h, r, headR: r * 0.72 };
  }

  function makePawn(colorHex) {
    const { h, r, headR } = bodyDims();
    const root = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colorHex) });
    const headMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(colorHex).offsetHSL(0, 0, 0.12),
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.05, h - r * 2), 4, 8), bodyMat);
    body.position.y = h * 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 8, 6), headMat);
    head.position.y = h + headR * 0.35;
    root.add(body);
    root.add(head);
    group.add(root);
    return { root, body, head, bodyMat, headMat };
  }

  function pickSurfaceColumn() {
    const hx = grid.halfX;
    const hz = grid.halfZ;
    for (let attempt = 0; attempt < 48; attempt++) {
      const x = Math.floor(Math.random() * grid.worldSize.x) - hx;
      const z = Math.floor(Math.random() * grid.worldSize.z) - hz;
      const sy = grid.surfaceY(x, z);
      if (sy != null) return { x, z, y: sy };
    }
    return { x: 0, z: 0, y: grid.surfaceY(0, 0) ?? -1 };
  }

  function placeOnSurface(pawn) {
    const col = pickSurfaceColumn();
    pawn.x = col.x;
    pawn.z = col.z;
    const y = (col.y + 1) * CELL;
    pawn.root.position.set((pawn.x + 0.5) * CELL, y, (pawn.z + 0.5) * CELL);
  }

  function rebuildMeshes() {
    const { h, r, headR } = bodyDims();
    for (const p of pawns) {
      p.body.geometry.dispose();
      p.body.geometry = new THREE.CapsuleGeometry(r, Math.max(0.05, h - r * 2), 4, 8);
      p.body.position.y = h * 0.5;
      p.head.geometry.dispose();
      p.head.geometry = new THREE.SphereGeometry(headR, 8, 6);
      p.head.position.y = h + headR * 0.35;
      const sy = grid.surfaceY(Math.floor(p.x), Math.floor(p.z));
      const y = ((sy ?? -1) + 1) * CELL;
      p.root.position.y = y;
    }
  }

  for (let i = 0; i < count; i++) {
    const mesh = makePawn(colors[i % colors.length]);
    const pawn = {
      ...mesh,
      x: 0,
      z: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 0.55 + Math.random() * 0.45,
      heading: Math.random() * Math.PI * 2,
      bob: 0,
    };
    placeOnSurface(pawn);
    pawns.push(pawn);
  }

  function setHeightBlocks(n) {
    heightBlocks = Math.max(0.75, Number(n) || 2);
    rebuildMeshes();
    return heightBlocks;
  }

  function getHeightBlocks() {
    return heightBlocks;
  }

  function respawn() {
    for (const p of pawns) placeOnSurface(p);
  }

  /**
   * @param {number} dt seconds
   */
  function update(dt) {
    if (!pawns.length) return;
    const t = dt || 0;
    for (const p of pawns) {
      p.bob += t;
      if (walk) {
        p.heading += Math.sin(p.bob * 0.35 + p.phase) * 0.4 * t;
        const step = p.speed * t;
        const nx = p.root.position.x + Math.cos(p.heading) * step;
        const nz = p.root.position.z + Math.sin(p.heading) * step;
        const cx = Math.floor(nx / CELL);
        const cz = Math.floor(nz / CELL);
        const sy = grid.surfaceY(cx, cz);
        if (sy != null && grid.inBounds(cx, sy, cz)) {
          p.x = cx;
          p.z = cz;
          p.root.position.x = nx;
          p.root.position.z = nz;
          p.root.position.y = (sy + 1) * CELL;
        } else {
          p.heading += Math.PI * 0.55;
        }
        p.root.rotation.y = -p.heading + Math.PI / 2;
        p.body.position.y = heightBlocks * CELL * 0.5 + Math.sin(p.bob * 6 + p.phase) * 0.04;
      } else {
        p.body.position.y = heightBlocks * CELL * 0.5 + Math.sin(p.bob * 2 + p.phase) * 0.03;
      }
    }
  }

  function dispose() {
    scene.remove(group);
    for (const p of pawns) {
      p.body.geometry.dispose();
      p.head.geometry.dispose();
      p.bodyMat.dispose();
      p.headMat.dispose();
    }
    pawns.length = 0;
    group.clear();
  }

  return {
    group,
    update,
    dispose,
    respawn,
    setHeightBlocks,
    getHeightBlocks,
    get count() {
      return pawns.length;
    },
  };
}

