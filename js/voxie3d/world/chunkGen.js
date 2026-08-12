/**
 * Batched world-chunk generation + pulsing AABB preview (potato-friendly).
 */

import * as THREE from "three";
import {
  chunkBounds,
  chunkKey,
  neighborChunks,
  normalizeChunkSize,
  pickAnchorChunk,
  readChunkMeta,
  writeChunkMeta,
  worldSizeForChunks,
} from "./chunks.js";
import { getBiome } from "./biomes.js";
import {
  createChunkTerrainContext,
  fillTerrainColumn,
  listChunkColumns,
} from "./terrain.js";
import { hashSeed } from "./seed.js";

/**
 * @param {object} deps
 * @param {import('../core/VoxelGrid.js').VoxelGrid} deps.grid
 * @param {import('../render/VoxelRenderer.js').VoxelRenderer} deps.voxelView
 * @param {THREE.Scene} deps.scene
 * @param {(type:string, payload?:any) => void} deps.emit
 * @param {() => void} [deps.emitChange]
 * @param {() => boolean} [deps.isPotato]
 */
export function createChunkGenController(deps) {
  const { grid, voxelView, scene, emit, emitChange, isPotato } = deps;

  const previewRoot = new THREE.Group();
  previewRoot.name = "voxie3d-chunk-preview";
  scene.add(previewRoot);

  /** @type {Map<string, { mesh: THREE.LineSegments, mat: THREE.LineBasicMaterial, biome: string }>} */
  const outlines = new Map();
  /** @type {null | { cancelled: boolean, raf: number, idle: number }} */
  let job = null;
  let pulseT = 0;

  function potato() {
    return typeof isPotato === "function" ? !!isPotato() : false;
  }

  function batchSize() {
    return potato() ? 24 : 64;
  }

  function ensureChunkMetaShell() {
    const ws = grid.worldSize;
    const cur = readChunkMeta(grid.meta);
    // Default chunk XZ follows world footprint (min 32, prefer 64 for larger worlds).
    const chunkSize =
      cur.chunkSize ||
      normalizeChunkSize(Math.min(ws.x, ws.z), Math.min(ws.x, ws.z) >= 48 ? 64 : 32);
    const height = Math.max(cur.height, ws.y);
    const meta = writeChunkMeta(grid.meta, {
      chunkSize,
      height,
      map: cur.map,
    });
    grid.setMeta?.(meta);
    return readChunkMeta(grid.meta);
  }

  function getChunkMap() {
    return readChunkMeta(grid.meta);
  }

  function recordChunk(cx, cz, biome, seed) {
    const shell = ensureChunkMetaShell();
    const key = chunkKey(cx, cz);
    const meta = writeChunkMeta(grid.meta, {
      chunkSize: shell.chunkSize,
      height: Math.max(shell.height, grid.worldSize.y),
      map: {
        ...shell.map,
        [key]: { biome: getBiome(biome).id, seed: seed >>> 0 },
      },
    });
    grid.setMeta?.(meta);
    return readChunkMeta(grid.meta);
  }

  /** Ensure origin chunk is registered after classic full-volume terrain. */
  function ensureOriginRecorded(seed, biome = "greenery") {
    const shell = ensureChunkMetaShell();
    if (shell.map["0,0"]) return shell;
    return recordChunk(0, 0, biome, seed ?? grid.seed ?? 0);
  }

  function clearOutlines() {
    for (const entry of outlines.values()) {
      previewRoot.remove(entry.mesh);
      entry.mesh.geometry?.dispose?.();
      entry.mat.dispose?.();
    }
    outlines.clear();
  }

  /**
   * Ghost AABB / pulsing outline for one or more chunk footprints.
   * @param {{ cx:number, cz:number, biome?:string }[]} chunks
   * @param {{ chunkSize?:number, height?:number }} [opts]
   */
  function setPreviewChunks(chunks, opts = {}) {
    clearOutlines();
    if (!chunks?.length) return;
    const shell = ensureChunkMetaShell();
    const cs = normalizeChunkSize(opts.chunkSize ?? shell.chunkSize, shell.chunkSize);
    const height = Math.max(4, opts.height ?? shell.height ?? grid.worldSize.y);

    for (const c of chunks) {
      const key = chunkKey(c.cx, c.cz);
      if (outlines.has(key)) continue;
      const b = chunkBounds(c.cx, c.cz, cs, height);
      const biome = getBiome(c.biome || "greenery");
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const d = b.maxZ - b.minZ;
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(biome.previewHex),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const mesh = new THREE.LineSegments(geo, mat);
      mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      mesh.renderOrder = 10;
      previewRoot.add(mesh);
      outlines.set(key, { mesh, mat, biome: biome.id });
    }
  }

  /**
   * Preview neighbor footprints from anchor + directions (does not generate).
   * @param {string|string[]} dirs
   * @param {{ biome?: string, anchor?: {cx:number,cz:number} }} [opts]
   */
  function previewDirections(dirs, opts = {}) {
    const shell = getChunkMap();
    const anchor = opts.anchor || pickAnchorChunk(shell.map);
    const neighbors = neighborChunks(anchor.cx, anchor.cz, dirs);
    const biome = getBiome(opts.biome).id;
    const pending = neighbors.filter((n) => !shell.map[chunkKey(n.cx, n.cz)]);
    setPreviewChunks(
      pending.map((n) => ({ cx: n.cx, cz: n.cz, biome })),
      { chunkSize: shell.chunkSize, height: shell.height }
    );
    return pending;
  }

  function expandForChunks(chunkList, chunkSize, height) {
    const shell = getChunkMap();
    const keys = [
      ...Object.keys(shell.map),
      ...chunkList.map((c) => chunkKey(c.cx, c.cz)),
    ];
    const need = worldSizeForChunks(keys, chunkSize, height);
    const cur = grid.worldSize;
    if (need.x > cur.x || need.y > cur.y || need.z > cur.z) {
      grid.setWorldSize({
        x: Math.max(cur.x, need.x),
        y: Math.max(cur.y, need.y),
        z: Math.max(cur.z, need.z),
      });
      voxelView.syncAll?.();
    }
  }

  function cancel() {
    if (!job) {
      clearOutlines();
      emit("chunkGenCancel", { reason: "idle" });
      return false;
    }
    job.cancelled = true;
    if (job.raf) cancelAnimationFrame(job.raf);
    if (job.idle && typeof cancelIdleCallback === "function") cancelIdleCallback(job.idle);
    job = null;
    clearOutlines();
    emit("chunkGenCancel", { reason: "user" });
    return true;
  }

  /**
   * Generate adjoining chunks by direction (batched).
   * @param {object} opts
   * @param {string|string[]} opts.dirs
   * @param {string} [opts.biome]
   * @param {number} [opts.seed]
   * @param {number} [opts.height]
   * @param {number} [opts.chunkSize] XZ footprint override for larger worlds
   * @param {{cx:number,cz:number}} [opts.anchor]
   */
  function addChunks(opts = {}) {
    if (grid.mode !== "world") grid.setMode?.("world");
    if (job) cancel();

    const shell = ensureChunkMetaShell();
    const biome = getBiome(opts.biome).id;
    const boost = getBiome(biome).heightBoost || 0;
    const height = Math.max(
      shell.height,
      grid.worldSize.y,
      Math.floor(Number(opts.height) || 0),
      shell.height + boost
    );
    // Prefer explicit chunkSize for “larger worlds”; else keep map’s established size.
    const chunkSize = normalizeChunkSize(
      opts.chunkSize ?? shell.chunkSize,
      shell.chunkSize || 64
    );
    if (chunkSize !== shell.chunkSize) {
      grid.setMeta?.(
        writeChunkMeta(grid.meta, {
          chunkSize,
          height: Math.max(shell.height, height),
          map: shell.map,
        })
      );
    }
    const anchor = opts.anchor || pickAnchorChunk(shell.map);
    const neighbors = neighborChunks(anchor.cx, anchor.cz, opts.dirs || []);
    const targets = neighbors.filter((n) => !shell.map[chunkKey(n.cx, n.cz)]);
    if (!targets.length) {
      emit("chunkGenDone", { added: [], skipped: neighbors.length, reason: "exists" });
      return { added: [], promise: Promise.resolve({ added: [] }) };
    }

    expandForChunks(targets, chunkSize, height);
    ensureChunkMetaShell();
    grid.setMeta?.(
      writeChunkMeta(grid.meta, {
        chunkSize,
        height: grid.worldSize.y,
        map: getChunkMap().map,
      })
    );

    setPreviewChunks(
      targets.map((t) => ({ cx: t.cx, cz: t.cz, biome })),
      { chunkSize, height: grid.worldSize.y }
    );

    const baseSeed =
      Number.isFinite(opts.seed)
        ? opts.seed >>> 0
        : Number.isFinite(grid.seed)
          ? grid.seed
          : hashSeed("chunk", Date.now());

    /** @type {{ cx:number, cz:number, dir:string, biome:string, seed:number, columns:{x:number,z:number}[], index:number, ctx:any }[]} */
    const queue = targets.map((t) => {
      const seed = hashSeed(baseSeed, t.cx, t.cz, biome) >>> 0;
      const ctx = createChunkTerrainContext(grid, seed, {
        biome,
        caves: true,
      });
      return {
        ...t,
        biome,
        seed,
        columns: listChunkColumns(t.cx, t.cz, chunkSize, grid.worldSize.y),
        index: 0,
        ctx,
      };
    });

    const state = { cancelled: false, raf: 0, idle: 0 };
    job = state;

    const promise = new Promise((resolve) => {
      const added = [];
      let totalCols = queue.reduce((n, q) => n + q.columns.length, 0);
      let doneCols = 0;

      const step = () => {
        if (state.cancelled || job !== state) {
          resolve({ added, cancelled: true });
          return;
        }

        const limit = batchSize();
        let placed = 0;
        /** @type {{x:number,y:number,z:number}[]} */
        const touched = [];

        while (queue.length && placed < limit) {
          const cur = queue[0];
          const col = cur.columns[cur.index];
          if (!col) {
            recordChunk(cur.cx, cur.cz, cur.biome, cur.seed);
            added.push({ cx: cur.cx, cz: cur.cz, biome: cur.biome, seed: cur.seed });
            outlines.get(chunkKey(cur.cx, cur.cz))?.mat &&
              (outlines.get(chunkKey(cur.cx, cur.cz)).mat.opacity = 0.2);
            // Drop outline when fully populated.
            const key = chunkKey(cur.cx, cur.cz);
            const entry = outlines.get(key);
            if (entry) {
              previewRoot.remove(entry.mesh);
              entry.mesh.geometry?.dispose?.();
              entry.mat.dispose?.();
              outlines.delete(key);
            }
            queue.shift();
            emit("chunkGenProgress", {
              doneCols,
              totalCols,
              chunk: { cx: cur.cx, cz: cur.cz },
              complete: !queue.length,
            });
            continue;
          }
          const cells = fillTerrainColumn(grid, col.x, col.z, cur.ctx, { expand: true });
          for (const c of cells) touched.push(c);
          placed += 1;
          cur.index += 1;
          doneCols += 1;
        }

        if (touched.length) voxelView.syncCells?.(touched);
        emit("chunkGenProgress", {
          doneCols,
          totalCols,
          ratio: totalCols ? doneCols / totalCols : 1,
          remainingChunks: queue.length,
        });

        if (!queue.length) {
          job = null;
          clearOutlines();
          emitChange?.();
          emit("chunkGenDone", { added });
          resolve({ added, cancelled: false });
          return;
        }

        schedule();
      };

      const schedule = () => {
        if (potato() && typeof requestIdleCallback === "function") {
          state.idle = requestIdleCallback(() => step(), { timeout: 48 });
        } else {
          state.raf = requestAnimationFrame(() => step());
        }
      };

      emit("chunkGenStart", {
        targets: targets.map((t) => ({ cx: t.cx, cz: t.cz, dir: t.dir, biome })),
        batch: batchSize(),
        totalCols,
      });
      schedule();
    });

    return { added: targets, promise };
  }

  function update(dt) {
    if (!outlines.size) return;
    pulseT += dt || 0.016;
    const pulse = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(pulseT * 4.2));
    for (const entry of outlines.values()) {
      entry.mat.opacity = pulse;
    }
  }

  function dispose() {
    cancel();
    clearOutlines();
    scene.remove(previewRoot);
  }

  return {
    addChunks,
    cancel,
    previewDirections,
    setPreviewChunks,
    clearPreview: clearOutlines,
    getChunkMap,
    ensureOriginRecorded,
    recordChunk,
    update,
    dispose,
    isBusy: () => !!job,
  };
}
