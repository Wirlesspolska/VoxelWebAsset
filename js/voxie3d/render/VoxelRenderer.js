import * as THREE from "three";
import { voxelKey } from "../core/VoxelGrid.js";
import { classifyVoxelVisibility } from "./layerVisibility.js";
import { getAssetCache } from "../cache/AssetCache.js";
import { buildGreedyMesh, collectHaloOccupancy } from "./greedyMesh.js";
import { createBlockAtlas } from "../materials/blockAtlas.js";
import { blockAtlasMeta } from "../materials/blockAtlasMeta.js";

const CELL = 1;
/** Chunk edge length in voxels — rebuild cost stays local to one neighborhood. */
export const CHUNK_SIZE = 8;

/**
 * Owns Three.js meshes for a VoxelGrid via dirty-chunk updates.
 * Default: full-cube InstancedMesh. Optional greedy surface meshes for large worlds.
 * Materials are cached by color/ghost key and retained for the session.
 */
export class VoxelRenderer {
  /**
   * @param {import('three').Scene} scene
   * @param {import('../core/VoxelGrid.js').VoxelGrid} grid
   */
  constructor(scene, grid) {
    this.scene = scene;
    this.grid = grid;
    this.group = new THREE.Group();
    this.group.name = "voxie3d-voxels";
    scene.add(this.group);

    this._boxGeo = new THREE.BoxGeometry(CELL, CELL, CELL);
    this._edgeGeo = new THREE.EdgesGeometry(this._boxGeo);
    this._assetCache = getAssetCache();
    this._matCache = new Map();
    this._blockAtlas = createBlockAtlas();
    this._atlasMeta = blockAtlasMeta();
    this._edgeMat = new THREE.LineBasicMaterial({
      color: 0x1a2018,
      transparent: true,
      opacity: 0.85,
      depthTest: true,
      depthWrite: false,
    });
    // Unlit by default — forge WYSIWYG: CSS swatch == placed voxel (no Lambert shift).
    // Terrain chunks use atlas materials when textures are enabled.
    this._useBlockTextures = true;
    this._litMaterials = false;
    /** @type {'greedy'|'hybrid'|'instances'} */
    this._meshMode = "instances";
    // Instance path colors via InstancedMesh.setColorAt (USE_INSTANCING_COLOR).
    // Do NOT set vertexColors here — BoxGeometry has no `color` attr; USE_COLOR
    // would multiply instanceColor by 0 and paint the whole world black.
    const solidKey = "chunk:solid:basic";
    const ghostKey = "chunk:ghost:basic";
    let solidMat = this._assetCache.getMaterial(solidKey);
    if (!solidMat) {
      solidMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this._assetCache.rememberMaterial(solidKey, solidMat);
    }
    solidMat.vertexColors = false;
    solidMat.color.set(0xffffff);
    let ghostMat = this._assetCache.getMaterial(ghostKey);
    if (!ghostMat) {
      ghostMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      this._assetCache.rememberMaterial(ghostKey, ghostMat);
    }
    ghostMat.vertexColors = false;
    ghostMat.color.set(0xffffff);
    this._solidMat = solidMat;
    this._ghostMat = ghostMat;
    this._atlasSolidMat = this._blockAtlas.materialFor({ potato: false, lit: false });
    this._atlasGhostMat = new THREE.MeshBasicMaterial({
      map: this._blockAtlas.ensureTexture(false),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      vertexColors: true,
    });
    this._assetCache.rememberMaterial("chunk:ghost:atlas", this._atlasGhostMat);
    this._previewGroup = new THREE.Group();
    this._previewGroup.name = "voxie3d-preview";
    scene.add(this._previewGroup);
    this._previewMeshes = [];
    this._previewMesh = null;
    this._previewAuraMesh = null;
    this._previewEdgeLines = null;
    this._previewContactMesh = null;
    this._previewContactCapacity = 0;
    this._previewCapacity = 0;
    this._contactFaceGeo = new THREE.BoxGeometry(1, 1, 1);
    this._edgeLineGeo = new THREE.EdgesGeometry(this._boxGeo);
    this._selectGroup = new THREE.Group();
    this._selectGroup.name = "voxie3d-select";
    scene.add(this._selectGroup);
    this._selectMesh = null;
    this._selectCapacity = 0;
    this._selectPending = null;
    this._selectRaf = 0;
    this._selectSig = "";
    this._selDummy = new THREE.Matrix4();
    this._selPos = new THREE.Vector3();
    this._selQuat = new THREE.Quaternion();
    this._selScale = new THREE.Vector3(1.06, 1.06, 1.06);

    // Shift+drag selection range preview (distinct from committed overlay).
    this._dragPreviewGroup = new THREE.Group();
    this._dragPreviewGroup.name = "voxie3d-select-drag";
    this._dragPreviewGroup.visible = false;
    scene.add(this._dragPreviewGroup);
    this._dragFillMat = new THREE.MeshBasicMaterial({
      color: 0x88ffcc,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this._dragEdgeMat = new THREE.LineBasicMaterial({
      color: 0xaaffee,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this._dragVoxelMat = new THREE.MeshBasicMaterial({
      color: 0x99ffdd,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: true,
    });
    this._dragFillMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this._dragFillMat);
    this._dragFillMesh.renderOrder = 5;
    this._dragFillMesh.frustumCulled = false;
    this._dragEdgeGeo = new THREE.EdgesGeometry(this._dragFillMesh.geometry);
    this._dragEdgeMesh = new THREE.LineSegments(this._dragEdgeGeo, this._dragEdgeMat);
    this._dragEdgeMesh.renderOrder = 6;
    this._dragEdgeMesh.frustumCulled = false;
    this._dragPreviewGroup.add(this._dragFillMesh, this._dragEdgeMesh);
    this._dragInstMesh = null;
    this._dragInstCapacity = 0;
    this._dragPendingKeys = null;
    this._dragFlushRaf = 0;
    this._dragPulseRaf = 0;
    this._dragPulseOn = false;
    this._dragSig = "";
    /** Soft voxel instances capped for FPS during large marquee. */
    this._dragInstCap = 2048;
    this._coalesceMs = 0;
    this._maxDirtyPerFrame = 0;
    this._flushTimer = 0;

    this._chunkSize = CHUNK_SIZE;
    this._potato = false;

    /** @type {Map<string, ChunkEntry>} */
    this._chunks = new Map();
    /** @type {Set<string>} */
    this._dirty = new Set();
    this._raf = 0;
    this._reqId = 0;
    /**
     * Mesh worker pool slots: { worker, busy }.
     * @type {{ worker: Worker, busy: boolean }[]}
     */
    this._workers = [];
    /** @type {{ type: string, reqId: number, chunkKey: string, cell: number, solid: object[], ghost: object[] }[]} */
    this._workerQueue = [];
    /** Pref: 0 | 1 | 2 | 'auto' */
    this._meshWorkerThreads = "auto";
    /** Resolved pool size (0 = main-thread pack). */
    this._meshWorkerCount = 0;
    this._meshWorkerEnabled = true;
    this._syncWorkerPool();

    /** LOD: off | distance | center-cone */
    this._lodMode = "off";
    this._lodNear = 28;
    this._lodFar = 72;
    this._bordersNearOnly = false;
    /** gpu | cpu-lite */
    this._renderPath = "gpu";
    /** 0 = unlimited on-screen instance budget */
    this._maxInstances = 0;
    /** @type {import('three').Camera|null} */
    this._lodCamera = null;
    this._lodFocus = new THREE.Vector3();
    this._tmpChunkCenter = new THREE.Vector3();
    this._tmpCamDir = new THREE.Vector3();
    this._tmpToChunk = new THREE.Vector3();
    this._frustum = new THREE.Frustum();
    this._projScreen = new THREE.Matrix4();
    this._chunkBox = new THREE.Box3();
    this._chunkBoxMin = new THREE.Vector3();
    this._chunkBoxMax = new THREE.Vector3();
    /** Half-angle cosine for center-cone (~35°). */
    this._coneCos = Math.cos((35 * Math.PI) / 180);
    this._lodFrameSig = "";
    this._instanceCount = 0;
    /** Host skip-idle: set when meshes/overlays change and need one draw. */
    this._needsDraw = true;
    this._pickScratch = new THREE.Vector3();

    this.borders = true;
    this.layerMode = "all";
    this.isolatePart = false;
    this._gridVisible = true;

    this.rollOver = this._makeRollOver();
    scene.add(this.rollOver);

    this.editPlane = this._makeEditPlane();
    scene.add(this.editPlane);

    this.gridHelper = null;
    this._helperKey = "";
    this._buildGridHelper();

    this.sliceHelper = this._makeSliceHelper();
    scene.add(this.sliceHelper);

    this.updateEditPlane();
  }

  /**
   * Resolve concrete pool size from pref (0 = off / main only).
   * @param {0|1|2|'auto'|string|number} pref
   */
  static resolveMeshWorkerCount(pref) {
    if (pref === 0 || pref === "0") return 0;
    if (pref === 1 || pref === "1") return 1;
    if (pref === 2 || pref === "2") return 2;
    const hc =
      (typeof navigator !== "undefined" && Number(navigator.hardwareConcurrency)) || 2;
    return Math.max(1, Math.min(4, hc | 0));
  }

  _desiredWorkerCount() {
    if (!this._meshWorkerEnabled || this._renderPath === "cpu-lite") return 0;
    return VoxelRenderer.resolveMeshWorkerCount(this._meshWorkerThreads);
  }

  /** Spawn / shrink the mesh packing worker pool to match prefs. */
  _syncWorkerPool() {
    const desired = this._desiredWorkerCount();
    this._meshWorkerCount = desired;
    if (desired <= 0) {
      this._stopWorker();
      return;
    }
    while (this._workers.length > desired) {
      let idx = this._workers.findIndex((s) => !s.busy);
      if (idx < 0) idx = this._workers.length - 1;
      const slot = this._workers.splice(idx, 1)[0];
      if (!slot) break;
      try {
        slot.worker.terminate();
      } catch {
        /* ignore */
      }
    }
    while (this._workers.length < desired) {
      try {
        const url = new URL("./meshWorker.js", import.meta.url);
        const worker = new Worker(url, { type: "module" });
        const slot = { worker, busy: false };
        worker.onmessage = (ev) => this._onWorkerBuilt(ev.data, slot);
        worker.onerror = () => {
          try {
            worker.terminate();
          } catch {
            /* ignore */
          }
          const i = this._workers.indexOf(slot);
          if (i >= 0) this._workers.splice(i, 1);
          this._meshWorkerCount = this._workers.length;
        };
        this._workers.push(slot);
      } catch {
        break;
      }
    }
    this._meshWorkerCount = this._workers.length;
    this._drainWorkerQueue();
  }

  _stopWorker() {
    this._workerQueue.length = 0;
    for (const slot of this._workers) {
      try {
        slot.worker.terminate();
      } catch {
        /* ignore */
      }
    }
    this._workers.length = 0;
    this._meshWorkerCount = 0;
    for (const entry of this._chunks.values()) {
      if (entry.pendingReq) entry.pendingReq = 0;
    }
  }

  /** Whether mesh worker should pack chunks this flush. */
  _workerActive() {
    return (
      this._meshWorkerEnabled &&
      this._renderPath !== "cpu-lite" &&
      this._workers.length > 0
    );
  }

  _postWorkerJob(job) {
    const slot = this._workers.find((s) => !s.busy);
    if (slot) {
      slot.busy = true;
      slot.worker.postMessage(job);
      return;
    }
    this._workerQueue.push(job);
  }

  _drainWorkerQueue() {
    while (this._workerQueue.length) {
      const slot = this._workers.find((s) => !s.busy);
      if (!slot) break;
      const job = this._workerQueue.shift();
      if (!job) break;
      slot.busy = true;
      slot.worker.postMessage(job);
    }
  }

  /**
   * Enable/disable off-main-thread chunk packing.
   * @param {boolean} on
   */
  setMeshWorkerEnabled(on) {
    this._meshWorkerEnabled = !!on;
    if (!this._meshWorkerEnabled && this._meshWorkerThreads !== 0) {
      // Keep threads pref; enabled flag alone can park the pool.
    }
    this._syncWorkerPool();
    return this._meshWorkerEnabled;
  }

  getMeshWorkerEnabled() {
    return this._meshWorkerEnabled;
  }

  /**
   * CPU threads for meshing: 0 (main only) | 1 | 2 | 'auto'.
   * @param {0|1|2|'auto'|string|number} n
   */
  setMeshWorkerThreads(n) {
    let next = n;
    if (next === 0 || next === "0") next = 0;
    else if (next === 1 || next === "1") next = 1;
    else if (next === 2 || next === "2") next = 2;
    else next = "auto";
    this._meshWorkerThreads = next;
    this._meshWorkerEnabled = next !== 0;
    this._syncWorkerPool();
    return this._meshWorkerThreads;
  }

  getMeshWorkerThreads() {
    return this._meshWorkerThreads;
  }

  getMeshWorkerCount() {
    return this._meshWorkerCount;
  }

  /**
   * @param {'gpu'|'cpu-lite'} path
   */
  setRenderPath(path) {
    const next = path === "cpu-lite" ? "cpu-lite" : "gpu";
    if (next === this._renderPath) return this._renderPath;
    this._renderPath = next;
    this._syncWorkerPool();
    return this._renderPath;
  }

  /** CPU-lite uses a small coalesce floor when host left delay at 0. */
  _effectiveCoalesceMs() {
    const ms = this._coalesceMs | 0;
    if (this._renderPath === "cpu-lite" && ms === 0) return 16;
    return ms;
  }

  getRenderPath() {
    return this._renderPath;
  }

  /**
   * @param {number} n 0 = unlimited
   */
  setMaxInstances(n) {
    this._maxInstances = Math.max(0, Math.min(2_000_000, Number(n) || 0)) | 0;
    this._lodFrameSig = "";
    return this._maxInstances;
  }

  getMaxInstances() {
    return this._maxInstances;
  }

  /**
   * @param {'off'|'distance'|'center-cone'} mode
   */
  setLodMode(mode) {
    const next = ["off", "distance", "center-cone"].includes(mode) ? mode : "off";
    if (next === this._lodMode) return this._lodMode;
    this._lodMode = next;
    this._lodFrameSig = "";
    return this._lodMode;
  }

  getLodMode() {
    return this._lodMode;
  }

  setLodNear(n) {
    this._lodNear = Math.max(4, Math.min(512, Number(n) || 28));
    if (this._lodFar < this._lodNear + 4) this._lodFar = this._lodNear + 4;
    this._lodFrameSig = "";
    return this._lodNear;
  }

  getLodNear() {
    return this._lodNear;
  }

  setLodFar(n) {
    this._lodFar = Math.max(this._lodNear + 4, Math.min(1024, Number(n) || 72));
    this._lodFrameSig = "";
    return this._lodFar;
  }

  getLodFar() {
    return this._lodFar;
  }

  setBordersNearOnly(on) {
    this._bordersNearOnly = !!on;
    this._lodFrameSig = "";
    // Refresh edge visibility without remeshing voxel instances.
    for (const entry of this._chunks.values()) {
      this._applyEdgeVisibility(entry);
    }
    return this._bordersNearOnly;
  }

  getBordersNearOnly() {
    return this._bordersNearOnly;
  }

  /**
   * Camera used for LOD / frustum (host sets each boot; tickLod refreshes).
   * @param {import('three').Camera|null} camera
   */
  setLodCamera(camera) {
    this._lodCamera = camera || null;
    this._lodFrameSig = "";
  }

  /**
   * True when dirty-chunk flush / worker build is outstanding.
   */
  hasPendingMeshWork() {
    if (this._dirty.size || this._raf || this._flushTimer) return true;
    if (this._workerQueue.length) return true;
    if (this._workers.some((s) => s.busy)) return true;
    for (const entry of this._chunks.values()) {
      if (entry.pendingReq) return true;
    }
    return false;
  }

  /** True if a WebGL draw is required (mesh/overlay/LOD changed). */
  needsDraw() {
    return !!this._needsDraw || this.hasPendingMeshWork();
  }

  /** Host calls after a successful render to clear the draw request. */
  clearNeedsDraw() {
    this._needsDraw = false;
  }

  markNeedsDraw() {
    this._needsDraw = true;
  }

  getInstanceCount() {
    return this._instanceCount | 0;
  }

  /**
   * Surface meshing path:
   * instances = full cubes (default — clear authoring look)
   * hybrid = near chunks instanced; far = greedy
   * greedy = face-culled merged quads (opt-in)
   * @param {'greedy'|'hybrid'|'instances'|string} mode
   */
  setMeshMode(mode) {
    const next =
      mode === "greedy" || mode === "hybrid" || mode === "instances" ? mode : "instances";
    if (next === this._meshMode) return this._meshMode;
    this._meshMode = next;
    this.syncAll();
    return this._meshMode;
  }

  getMeshMode() {
    return this._meshMode;
  }

  /** Terrain block atlas textures (off → flat vertex colors). */
  setBlockTextures(on) {
    const next = !!on;
    if (next === this._useBlockTextures) return this._useBlockTextures;
    this._useBlockTextures = next;
    this._refreshChunkMaterials();
    this._needsDraw = true;
    return this._useBlockTextures;
  }

  getBlockTextures() {
    return this._useBlockTextures;
  }

  /**
   * When true, solid chunks use Lambert + respond to scene lights.
   * Ambient-only still reads; meaningful shading needs a user light.
   */
  setLitMaterials(on) {
    const next = !!on;
    if (next === this._litMaterials) return this._litMaterials;
    this._litMaterials = next;
    this._atlasSolidMat = this._blockAtlas.materialFor({
      potato: this._potato,
      lit: next,
    });
    this._refreshChunkMaterials();
    this._needsDraw = true;
    return this._litMaterials;
  }

  getLitMaterials() {
    return this._litMaterials;
  }

  _refreshChunkMaterials() {
    for (const entry of this._chunks.values()) {
      if (entry.solid) {
        entry.solid.material = this._solidMaterialFor(entry.solid.userData?.meshMode);
      }
      if (entry.ghost) {
        entry.ghost.material = this._ghostMaterialFor(entry.ghost.userData?.meshMode);
      }
    }
  }

  _solidMaterialFor(meshMode) {
    if (meshMode === "instances") return this._solidMat;
    if (this._useBlockTextures) {
      return this._blockAtlas.materialFor({ potato: this._potato, lit: this._litMaterials });
    }
    return this._solidMat;
  }

  _ghostMaterialFor(meshMode) {
    if (meshMode === "instances") return this._ghostMat;
    if (this._useBlockTextures) return this._atlasGhostMat;
    return this._ghostMat;
  }

  _chunkBudgetCost(entry) {
    // Budget by source voxels (stable) — greedy faces are much cheaper to draw.
    return (entry.solidKeys?.length || 0) + (entry.ghostKeys?.length || 0);
  }

  /**
   * Per-frame LOD + frustum + instance budget. Does not remesh far chunks.
   * @param {import('three').Camera} camera
   * @param {import('three').Vector3} [focus] look-at / pivot (center-cone)
   * @returns {boolean} true when visibility changed (needs a draw)
   */
  tickLod(camera, focus) {
    const cam = camera || this._lodCamera;
    if (!cam) return false;
    this._lodCamera = cam;
    if (focus) this._lodFocus.copy(focus);
    else cam.getWorldDirection(this._tmpCamDir);

    const px = cam.position.x;
    const py = cam.position.y;
    const pz = cam.position.z;
    const fx = this._lodFocus.x;
    const fy = this._lodFocus.y;
    const fz = this._lodFocus.z;
    const sig = `${this._lodMode}|${this._lodNear}|${this._lodFar}|${this._bordersNearOnly ? 1 : 0}|${this._maxInstances}|${px.toFixed(2)}|${py.toFixed(2)}|${pz.toFixed(2)}|${fx.toFixed(2)}|${fy.toFixed(2)}|${fz.toFixed(2)}|${this._chunks.size}`;
    if (sig === this._lodFrameSig) return false;
    this._lodFrameSig = sig;

    cam.updateMatrixWorld?.(true);
    this._projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreen);
    cam.getWorldDirection(this._tmpCamDir);

    /** @type {{ entry: ChunkEntry, dist: number, tier: string, inView: boolean }[]} */
    const ranked = [];
    for (const entry of this._chunks.values()) {
      const dist = this._chunkDistance(entry.key, cam);
      const tier = this._evalLodTier(entry.key, cam, dist);
      const inView = this._chunkInFrustum(entry.key);
      ranked.push({ entry, dist, tier, inView });
    }
    ranked.sort((a, b) => a.dist - b.dist);

    let budgetLeft =
      this._maxInstances > 0 ? this._maxInstances : Number.POSITIVE_INFINITY;
    let total = 0;
    let changed = false;

    for (const row of ranked) {
      const { entry, tier, inView } = row;
      const count = this._chunkBudgetCost(entry);
      const underBudget = count <= budgetLeft;
      const show = inView && underBudget && tier !== "hidden";
      const prevTier = entry.lodTier || "near";
      if (prevTier !== tier) {
        entry.lodTier = tier;
        changed = true;
        // Hybrid: remesh when crossing near↔far (instances ↔ greedy).
        if (
          this._meshMode === "hybrid" &&
          ((prevTier === "near" && tier !== "near") ||
            (prevTier !== "near" && tier === "near"))
        ) {
          this._dirty.add(entry.key);
        }
        // Far→near: build borders if missing (no full voxel remesh).
        if (
          this.borders &&
          tier === "near" &&
          !entry.edges &&
          entry.solidKeys?.length
        ) {
          this._syncChunkEdges(entry);
        }
      }
      const prevShow = entry.lodVisible !== false;
      if (prevShow !== show) {
        entry.lodVisible = show;
        changed = true;
      }
      if (entry.solid) entry.solid.visible = show;
      if (entry.ghost) entry.ghost.visible = show;
      this._applyEdgeVisibility(entry);
      if (show) {
        budgetLeft -= count;
        total += count;
      }
    }
    if (this._dirty.size) this._scheduleFlush();
    this._instanceCount = total;
    if (changed) this._needsDraw = true;
    return changed;
  }

  _chunkCenter(chunkKey, out = this._tmpChunkCenter) {
    const { cx, cy, cz } = this._parseChunkKey(chunkKey);
    const cs = this._chunkSize;
    const half = cs * 0.5 * CELL;
    out.set(cx * cs * CELL + half, cy * cs * CELL + half, cz * cs * CELL + half);
    return out;
  }

  _chunkDistance(chunkKey, camera) {
    const c = this._chunkCenter(chunkKey, this._tmpChunkCenter);
    return c.distanceTo(camera.position);
  }

  _chunkInFrustum(chunkKey) {
    const { cx, cy, cz } = this._parseChunkKey(chunkKey);
    const cs = this._chunkSize;
    const x0 = cx * cs * CELL;
    const y0 = cy * cs * CELL;
    const z0 = cz * cs * CELL;
    const x1 = x0 + cs * CELL;
    const y1 = y0 + cs * CELL;
    const z1 = z0 + cs * CELL;
    this._chunkBoxMin.set(x0, y0, z0);
    this._chunkBoxMax.set(x1, y1, z1);
    this._chunkBox.set(this._chunkBoxMin, this._chunkBoxMax);
    return this._frustum.intersectsBox(this._chunkBox);
  }

  /**
   * @returns {'near'|'far'|'hidden'}
   */
  _evalLodTier(chunkKey, camera, distOpt) {
    const mode = this._lodMode;
    if (mode === "off") {
      // bordersNearOnly still uses distance for edge policy only.
      if (!this._bordersNearOnly) return "near";
      const dist = distOpt ?? this._chunkDistance(chunkKey, camera);
      return dist <= this._lodNear ? "near" : "far";
    }
    const dist = distOpt ?? this._chunkDistance(chunkKey, camera);
    if (dist <= this._lodNear) {
      if (mode === "center-cone") {
        // Near band always full detail (focus work area).
        return "near";
      }
      return "near";
    }
    if (mode === "center-cone") {
      const c = this._chunkCenter(chunkKey, this._tmpChunkCenter);
      this._tmpToChunk.subVectors(c, camera.position);
      const len = this._tmpToChunk.length();
      if (len < 1e-4) return "near";
      this._tmpToChunk.multiplyScalar(1 / len);
      const cos = this._tmpToChunk.dot(this._tmpCamDir);
      // Off-axis → treat as far (skip borders); very far + off-axis → hidden.
      if (cos < this._coneCos) {
        return dist > this._lodFar ? "hidden" : "far";
      }
    }
    if (dist > this._lodFar * 1.35) return "hidden";
    return "far";
  }

  _wantChunkBorders(entry) {
    if (!this.borders) return false;
    const tier = entry.lodTier || "near";
    if (tier === "hidden" || tier === "far") {
      if (this._bordersNearOnly || this._lodMode !== "off") return false;
    }
    if (this._bordersNearOnly && tier !== "near") return false;
    return true;
  }

  _applyEdgeVisibility(entry) {
    if (!entry?.edges) return;
    const show =
      this._wantChunkBorders(entry) && entry.lodVisible !== false;
    if (entry.edges.visible !== show) entry.edges.visible = show;
  }

  _footprint() {
    const ws = this.grid.worldSize;
    return Math.max(ws.x, ws.z);
  }

  _worldKey() {
    const ws = this.grid.worldSize;
    return `${ws.x}|${ws.y}|${ws.z}`;
  }

  _disposeGridHelper() {
    if (!this.gridHelper) return;
    this.scene.remove(this.gridHelper);
    this.gridHelper.geometry?.dispose?.();
    const mat = this.gridHelper.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
    else mat?.dispose?.();
    this.gridHelper = null;
  }

  /** Floor Y for the ground grid: part/asset uses Y=0; world uses volume bottom. */
  _gridFloorY() {
    if (this.grid.mode === "part") return 0;
    return -this.grid.halfY * CELL;
  }

  _gridHelperKey() {
    // Rebuild when size, mode, or potato (divisions/colors) change.
    return `${this._worldKey()}|${this.grid.mode}|p${this._potato ? 1 : 0}`;
  }

  _styleGridHelper(helper) {
    if (!helper) return;
    const mats = Array.isArray(helper.material) ? helper.material : [helper.material];
    for (const m of mats) {
      if (!m) continue;
      m.transparent = true;
      m.opacity = this._potato ? 0.9 : 0.95;
      m.depthWrite = false;
      m.toneMapped = false;
    }
    helper.renderOrder = 1;
  }

  _buildGridHelper() {
    const key = this._gridHelperKey();
    if (this.gridHelper && this._helperKey === key) {
      this.gridHelper.position.y = this._gridFloorY();
      return;
    }
    const wasVisible = this.gridHelper ? this.gridHelper.visible : this._gridVisible !== false;
    this._disposeGridHelper();
    const footprint = Math.max(2, this._footprint());
    // Potato: coarser divisions but brighter lines so the floor stays readable.
    const divisions = this._potato
      ? Math.max(4, Math.floor(footprint / 2))
      : footprint;
    // Dark forge bg (#0c0e0a) — prior 0x2a3228 / 0x3a4434 was nearly invisible.
    const centerColor = this._potato ? 0xb8c98a : 0x9aab78;
    const gridColor = this._potato ? 0x6a7a52 : 0x5a6848;
    this.gridHelper = new THREE.GridHelper(footprint, divisions, centerColor, gridColor);
    this.gridHelper.position.y = this._gridFloorY();
    this.gridHelper.visible = wasVisible;
    this._styleGridHelper(this.gridHelper);
    this._helperKey = key;
    this.scene.add(this.gridHelper);
  }

  setGridVisible(on) {
    this._gridVisible = !!on;
    if (this.gridHelper) this.gridHelper.visible = this._gridVisible;
    return this._gridVisible;
  }

  getGridVisible() {
    return this._gridVisible !== false;
  }

  /**
   * Slice-plane fill + edge outline (edit plane). Kept on by default for part/asset.
   * @param {boolean} on
   */
  setSliceHelperVisible(on) {
    if (this.sliceHelper) this.sliceHelper.visible = !!on;
    return !!this.sliceHelper?.visible;
  }

  getSliceHelperVisible() {
    return this.sliceHelper ? this.sliceHelper.visible !== false : true;
  }

  /** Rebuild floor grid + slice helper poses (size/mode/potato). */
  refreshHelpers() {
    this._buildGridHelper();
    this.updateEditPlane();
  }

  _makeRollOver() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc4e070,
      opacity: 0.55,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this._boxGeo, mat);
    mesh.visible = false;
    mesh.renderOrder = 6;
    // High-contrast wire aura so preview stays readable on same-color stacks.
    const aura = new THREE.LineSegments(
      new THREE.EdgesGeometry(this._boxGeo),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      })
    );
    aura.scale.setScalar(1.04);
    aura.renderOrder = 7;
    mesh.add(aura);
    mesh.userData.aura = aura;
    // Soft outer shell (additive-ish via high opacity complementary tint).
    const shell = new THREE.Mesh(
      this._boxGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        depthTest: true,
        side: THREE.BackSide,
        toneMapped: false,
      })
    );
    shell.scale.setScalar(1.12);
    shell.renderOrder = 5;
    mesh.add(shell);
    mesh.userData.shell = shell;
    return mesh;
  }

  /**
   * High-contrast place accent — neon against bright lime stacks.
   * Outline stays fixed vivid; fill is dark glass so it never matches paint.
   * @param {string} hex
   * @returns {{ fill: string, edge: string, contact: string }}
   */
  _previewAccentHex(hex) {
    void hex;
    return {
      fill: "#14081c",
      edge: "#ff2eb6",
      contact: "#00f0ff",
    };
  }

  /** Dedicated place-preview fill (dark glass — not volume ghost). */
  _previewMaterial(_hex) {
    const { fill } = this._previewAccentHex(_hex);
    const key = `preview:fill:${fill}`;
    let mat = this._matCache.get(key) || this._assetCache.getMaterial(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(fill),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      });
      this._matCache.set(key, mat);
      this._assetCache.rememberMaterial(key, mat);
    }
    return mat;
  }

  _previewEdgeMaterial() {
    const { edge } = this._previewAccentHex();
    const key = `preview:edge:${edge}`;
    let mat = this._matCache.get(key) || this._assetCache.getMaterial(key);
    if (!mat) {
      mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(edge),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      });
      this._matCache.set(key, mat);
      this._assetCache.rememberMaterial(key, mat);
    }
    return mat;
  }

  _previewContactMaterial() {
    const { contact } = this._previewAccentHex();
    const key = `preview:contact:${contact}`;
    let mat = this._matCache.get(key) || this._assetCache.getMaterial(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(contact),
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      this._matCache.set(key, mat);
      this._assetCache.rememberMaterial(key, mat);
    }
    return mat;
  }

  _makeEditPlane() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      visible: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "voxie3d-edit-plane";
    return mesh;
  }

  _makeSliceHelper() {
    const group = new THREE.Group();
    group.name = "voxie3d-slice-helper";
    const geo = new THREE.PlaneGeometry(1, 1);
    const fill = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xc4e070,
        // Slightly stronger fill so empty part workspaces read the edit plane on dark bg.
        opacity: 0.16,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    fill.renderOrder = 1;
    // Hard edge so snapped integer plane is obvious
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({
        color: 0xe8f5a0,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      })
    );
    edges.renderOrder = 2;
    group.add(fill);
    group.add(edges);
    group.userData.fill = fill;
    group.userData.edges = edges;
    group.visible = true;
    return group;
  }

  /** Shared materials by hex|ghost — never disposed on voxel edit. */
  _material(hex, ghost) {
    const key = `${hex}|${ghost ? 1 : 0}|basic`;
    let mat = this._matCache.get(key) || this._assetCache.getMaterial(`voxel:${key}`);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex),
        transparent: ghost,
        opacity: ghost ? 0.28 : 1,
        depthWrite: !ghost,
      });
      this._matCache.set(key, mat);
      this._assetCache.rememberMaterial(`voxel:${key}`, mat);
    }
    return mat;
  }

  cellToWorld(x, y, z, target = new THREE.Vector3()) {
    return target.set((x + 0.5) * CELL, (y + 0.5) * CELL, (z + 0.5) * CELL);
  }

  worldToCell(pos) {
    return {
      x: Math.floor(pos.x / CELL),
      y: Math.floor(pos.y / CELL),
      z: Math.floor(pos.z / CELL),
    };
  }

  _chunkCoord(n) {
    return Math.floor(n / this._chunkSize);
  }

  chunkKeyFor(x, y, z) {
    return `${this._chunkCoord(x)}|${this._chunkCoord(y)}|${this._chunkCoord(z)}`;
  }

  /**
   * POTATO PC MODE: coarser chunks + unlit materials (cheaper draw).
   * @param {boolean} on
   */
  setPotatoMode(on) {
    const next = !!on;
    if (next === this._potato) return this._potato;
    this._potato = next;
    this._chunkSize = next ? 16 : CHUNK_SIZE;
    // Potato coarsens chunks + drops atlas to flat tile colors (still textured UVs).
    const solidKey = "chunk:solid:basic";
    const ghostKey = "chunk:ghost:basic";
    let solid = this._assetCache.getMaterial(solidKey);
    let ghost = this._assetCache.getMaterial(ghostKey);
    if (!solid) {
      solid = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this._assetCache.rememberMaterial(solidKey, solid);
    }
    if (!ghost) {
      ghost = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      this._assetCache.rememberMaterial(ghostKey, ghost);
    }
    // Cached mats from older builds may still have vertexColors — strip them.
    solid.vertexColors = false;
    ghost.vertexColors = false;
    this._solidMat = solid;
    this._ghostMat = ghost;
    this._atlasSolidMat = this._blockAtlas.materialFor({ potato: next, lit: this._litMaterials });
    this._atlasGhostMat.map = this._blockAtlas.ensureTexture(next);
    this._atlasGhostMat.needsUpdate = true;
    this.syncAll();
    return this._potato;
  }

  getPotatoMode() {
    return this._potato;
  }

  getChunkSize() {
    return this._chunkSize;
  }

  _parseChunkKey(key) {
    const [cx, cy, cz] = key.split("|").map(Number);
    return { cx, cy, cz };
  }

  _visCtx() {
    return {
      axis: this.grid.axis,
      slice: this.grid.slice,
      baseSlice: this.grid.baseSlice(),
      mode: this.layerMode,
      isolatePart: this.isolatePart,
      partId: this.grid.partId,
    };
  }

  _collectChunkVoxels(chunkKey) {
    const { cx, cy, cz } = this._parseChunkKey(chunkKey);
    const cs = this._chunkSize;
    const x0 = cx * cs;
    const y0 = cy * cs;
    const z0 = cz * cs;
    const solid = [];
    const ghost = [];
    const ctx = this._visCtx();
    for (let x = x0; x < x0 + cs; x++) {
      for (let y = y0; y < y0 + cs; y++) {
        for (let z = z0; z < z0 + cs; z++) {
          const v = this.grid.get(x, y, z);
          if (!v) continue;
          const vis = classifyVoxelVisibility(v, ctx);
          if (vis === "hidden") continue;
          if (vis === "ghost") ghost.push(v);
          else solid.push(v);
        }
      }
    }
    return { solid, ghost };
  }

  setBorders(on) {
    // Independent of potato — edges use LineBasicMaterial (works with unlit solid mats).
    this.borders = !!on;
    // Remesh edges only when turning borders on; off just hides (LOD may already hide far).
    if (this.borders) {
      for (const key of this._chunks.keys()) this._dirty.add(key);
      this._scheduleFlush();
    } else {
      for (const entry of this._chunks.values()) {
        if (entry.edges) entry.edges.visible = false;
      }
    }
  }

  setLayerMode(mode) {
    this.layerMode = mode;
    this.applyVisibility();
  }

  setIsolatePart(on) {
    this.isolatePart = !!on;
    this.applyVisibility();
  }

  updateEditPlane() {
    // Slice is always integer; plane sits on cell centers (slice + 0.5).
    const axis = this.grid.axis;
    const slice = this.grid.slice | 0;
    const plane = this.editPlane;
    const helper = this.sliceHelper;
    const offset = (slice + 0.5) * CELL;
    const ws = this.grid.worldSize;

    plane.rotation.set(0, 0, 0);
    helper.rotation.set(0, 0, 0);
    plane.position.set(0, 0, 0);
    helper.position.set(0, 0, 0);

    if (axis === "z") {
      plane.scale.set(ws.x * CELL, ws.y * CELL, 1);
      helper.scale.set(ws.x * CELL, ws.y * CELL, 1);
      plane.position.z = offset;
      helper.position.z = offset;
    } else if (axis === "y") {
      plane.rotation.x = -Math.PI / 2;
      helper.rotation.x = -Math.PI / 2;
      plane.scale.set(ws.x * CELL, ws.z * CELL, 1);
      helper.scale.set(ws.x * CELL, ws.z * CELL, 1);
      plane.position.y = offset;
      helper.position.y = offset;
    } else {
      plane.rotation.y = Math.PI / 2;
      helper.rotation.y = Math.PI / 2;
      plane.scale.set(ws.z * CELL, ws.y * CELL, 1);
      helper.scale.set(ws.z * CELL, ws.y * CELL, 1);
      plane.position.x = offset;
      helper.position.x = offset;
    }

    if (this.gridHelper) {
      this.gridHelper.position.set(0, this._gridFloorY(), 0);
    }
  }

  /** Layer / isolate changes — mark every live chunk dirty (coalesced). */
  applyVisibility() {
    for (const key of this._chunks.keys()) this._dirty.add(key);
    // Also mark chunks that may gain newly-visible voxels from the full grid
    for (const v of this.grid.all()) {
      this._dirty.add(this.chunkKeyFor(v.x, v.y, v.z));
    }
    this._scheduleFlush();
  }

  /**
   * Incremental update for brush strokes — only touched neighborhoods rebuild.
   * @param {Array<{x:number,y:number,z:number}>|null|undefined} cells
   */
  syncCells(cells) {
    if (!cells?.length) {
      this.syncAll();
      return;
    }
    for (const c of cells) {
      this._dirty.add(this.chunkKeyFor(c.x, c.y, c.z));
    }
    this._scheduleFlush();
  }

  markDirtyChunks(chunkKeys) {
    for (const k of chunkKeys) this._dirty.add(k);
    this._scheduleFlush();
  }

  syncAll() {
    this._buildGridHelper();
    this.updateEditPlane();
    this._dirty.clear();
    const seen = new Set();
    for (const v of this.grid.all()) {
      const ck = this.chunkKeyFor(v.x, v.y, v.z);
      seen.add(ck);
      this._dirty.add(ck);
    }
    for (const key of [...this._chunks.keys()]) {
      if (!seen.has(key)) {
        this._disposeChunk(key);
      }
    }
    this._flushDirty(true);
  }

  /**
   * Delay before rebuilding dirty chunks (0 = next animation frame).
   * @param {number} ms
   */
  setRebuildCoalesceMs(ms) {
    this._coalesceMs = Math.max(0, Math.min(250, Number(ms) || 0));
    return this._coalesceMs;
  }

  getRebuildCoalesceMs() {
    return this._coalesceMs;
  }

  /**
   * Cap chunk rebuilds per flush (0 = unlimited). Remainder stays dirty.
   * @param {number} n
   */
  setMaxDirtyChunksPerFrame(n) {
    this._maxDirtyPerFrame = Math.max(0, Math.min(256, Number(n) || 0)) | 0;
    return this._maxDirtyPerFrame;
  }

  getMaxDirtyChunksPerFrame() {
    return this._maxDirtyPerFrame;
  }

  _scheduleFlush() {
    if (!this._dirty.size) return;
    if (this._raf || this._flushTimer) return;
    const ms = this._effectiveCoalesceMs();
    if (ms <= 0) {
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this._flushDirty(false);
      });
    } else {
      this._flushTimer = setTimeout(() => {
        this._flushTimer = 0;
        this._flushDirty(false);
      }, ms);
    }
  }

  _flushDirty(sync) {
    if (!this._dirty.size) return;
    const all = [...this._dirty];
    this._dirty.clear();
    // Prefer rebuilding nearer chunks first when a camera is known (LOD-friendly).
    if (this._lodCamera && all.length > 1) {
      all.sort(
        (a, b) =>
          this._chunkDistance(a, this._lodCamera) -
          this._chunkDistance(b, this._lodCamera)
      );
    }
    let budget =
      !sync && this._maxDirtyPerFrame > 0
        ? Math.min(this._maxDirtyPerFrame, all.length)
        : all.length;
    // CPU-lite: smaller rebuild budget when uncapped so the main thread stays responsive.
    if (
      !sync &&
      this._renderPath === "cpu-lite" &&
      this._maxDirtyPerFrame <= 0 &&
      all.length > 4
    ) {
      budget = Math.min(4, all.length);
    }
    const keys = all.slice(0, budget);
    for (let i = budget; i < all.length; i++) this._dirty.add(all[i]);
    const useWorker = !sync && this._workerActive();
    for (const chunkKey of keys) {
      const { solid, ghost } = this._collectChunkVoxels(chunkKey);
      if (!solid.length && !ghost.length) {
        this._disposeChunk(chunkKey);
        continue;
      }
      // Seed LOD tier before pack so edges skip far chunks without a second rebuild.
      const entry = this._ensureChunk(chunkKey);
      if (this._lodCamera) {
        entry.lodTier = this._evalLodTier(chunkKey, this._lodCamera);
      }
      const packMode = this._resolvePackMode(entry.lodTier);
      const { solidHalo, ghostHalo } = this._collectChunkHalos(chunkKey, solid, ghost);
      if (useWorker) {
        const reqId = ++this._reqId;
        entry.pendingReq = reqId;
        this._postWorkerJob({
          type: "build",
          reqId,
          chunkKey,
          cell: CELL,
          mode: packMode,
          solid: solid.map((v) => ({
            x: v.x,
            y: v.y,
            z: v.z,
            color: v.color,
            block: v.block,
          })),
          ghost: ghost.map((v) => ({
            x: v.x,
            y: v.y,
            z: v.z,
            color: v.color,
            block: v.block,
          })),
          solidHalo,
          ghostHalo,
        });
      } else {
        this._applyPacked(
          chunkKey,
          this._packLocal(solid, solidHalo, packMode),
          this._packLocal(ghost, ghostHalo, packMode),
          packMode
        );
      }
    }
    this._lodFrameSig = "";
    this._needsDraw = true;
    if (this._dirty.size) this._scheduleFlush();
  }

  /**
   * @param {'near'|'far'|'hidden'} [tier]
   * @returns {'greedy'|'instances'}
   */
  _resolvePackMode(tier) {
    if (this._meshMode === "instances") return "instances";
    if (this._meshMode === "hybrid") {
      return tier === "near" ? "instances" : "greedy";
    }
    if (this._meshMode === "greedy") return "greedy";
    return "instances";
  }

  _collectChunkHalos(chunkKey, solid, ghost) {
    const { cx, cy, cz } = this._parseChunkKey(chunkKey);
    const cs = this._chunkSize;
    const box = {
      x0: cx * cs,
      y0: cy * cs,
      z0: cz * cs,
      x1: cx * cs + cs,
      y1: cy * cs + cs,
      z1: cz * cs + cs,
    };
    // Halo: any occupied cell outside this chunk AABB (solid or ghost both occlude faces).
    const hasAny = (x, y, z) => !!this.grid.get(x, y, z);
    const halo = collectHaloOccupancy(hasAny, box);
    void solid;
    void ghost;
    return { solidHalo: halo, ghostHalo: halo };
  }

  _packLocal(voxels, halo = [], packMode = "instances") {
    if (packMode === "instances") {
      const n = voxels.length;
      const matrices = new Float32Array(n * 16);
      const colors = new Float32Array(n * 3);
      const keys = new Array(n);
      const color = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const v = voxels[i];
        keys[i] = voxelKey(v.x, v.y, v.z);
        const o = i * 16;
        matrices[o] = 1;
        matrices[o + 5] = 1;
        matrices[o + 10] = 1;
        matrices[o + 15] = 1;
        matrices[o + 12] = (v.x + 0.5) * CELL;
        matrices[o + 13] = (v.y + 0.5) * CELL;
        matrices[o + 14] = (v.z + 0.5) * CELL;
        color.set(v.color || "#888888");
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      return { count: n, matrices, colors, keys, mode: "instances" };
    }
    return buildGreedyMesh(voxels, {
      cell: CELL,
      occExtra: halo,
      atlasIndex: this._atlasMeta.materialKeyIndex,
      atlasSize: this._atlasMeta.size,
      paintIndex: this._atlasMeta.paintIndex ?? 0,
    });
  }

  _onWorkerBuilt(data, slot) {
    if (slot) {
      slot.busy = false;
      this._drainWorkerQueue();
    }
    if (!data || data.type !== "built") return;
    const entry = this._chunks.get(data.chunkKey);
    if (!entry || entry.pendingReq !== data.reqId) return;
    entry.pendingReq = 0;
    this._applyPacked(data.chunkKey, data.solid, data.ghost, data.meshMode || "instances");
    this._needsDraw = true;
  }

  _ensureChunk(chunkKey) {
    let entry = this._chunks.get(chunkKey);
    if (entry) return entry;
    entry = {
      key: chunkKey,
      solid: null,
      ghost: null,
      edges: null,
      solidKeys: [],
      ghostKeys: [],
      pendingReq: 0,
      capacity: 0,
      lodTier: "near",
      lodVisible: true,
      meshMode: "instances",
    };
    this._chunks.set(chunkKey, entry);
    return entry;
  }

  _applyPacked(chunkKey, solidPack, ghostPack, packMode = "instances") {
    const entry = this._ensureChunk(chunkKey);
    entry.solidKeys = solidPack.keys || [];
    entry.ghostKeys = ghostPack.keys || [];
    entry.meshMode = packMode;
    const mode = solidPack.mode || ghostPack.mode || packMode;
    if (mode === "instances") {
      entry.solid = this._uploadInstanced(
        entry.solid,
        solidPack,
        this._solidMat,
        chunkKey,
        "solid"
      );
      entry.ghost = this._uploadInstanced(
        entry.ghost,
        ghostPack,
        this._ghostMat,
        chunkKey,
        "ghost"
      );
    } else {
      entry.solid = this._uploadGreedy(
        entry.solid,
        solidPack,
        this._solidMaterialFor("greedy"),
        chunkKey,
        "solid"
      );
      entry.ghost = this._uploadGreedy(
        entry.ghost,
        ghostPack,
        this._ghostMaterialFor("greedy"),
        chunkKey,
        "ghost"
      );
    }
    this._syncChunkEdges(entry);
  }

  _releaseMesh(mesh) {
    if (!mesh) return;
    this.group.remove(mesh);
    // InstancedMesh shares _boxGeo — never dispose that.
    if (mesh.isInstancedMesh) return;
    mesh.geometry?.dispose?.();
  }

  _releaseInstanced(mesh) {
    this._releaseMesh(mesh);
  }

  _uploadInstanced(existing, pack, material, chunkKey, kind) {
    const count = pack.count | 0;
    if (count <= 0) {
      this._releaseMesh(existing);
      return null;
    }
    if (existing && !existing.isInstancedMesh) {
      this._releaseMesh(existing);
      existing = null;
    }
    const need = Math.max(count, 16);
    let mesh = existing;
    if (!mesh || (mesh.userData.capacity || 0) < count) {
      this._releaseMesh(mesh);
      const capacity = Math.max(need, Math.ceil(need * 1.25));
      mesh = new THREE.InstancedMesh(this._boxGeo, material, capacity);
      mesh.frustumCulled = true;
      mesh.userData.chunkKey = chunkKey;
      mesh.userData.kind = kind;
      mesh.userData.capacity = capacity;
      mesh.userData.meshMode = "instances";
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    const color = new THREE.Color();
    const dummy = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      dummy.fromArray(pack.matrices, i * 16);
      mesh.setMatrixAt(i, dummy);
      // Pack RGB is already linear (worker parseHexLinear / THREE.Color.r).
      color.setRGB(
        pack.colors[i * 3],
        pack.colors[i * 3 + 1],
        pack.colors[i * 3 + 2],
        THREE.LinearSRGBColorSpace
      );
      mesh.setColorAt(i, color);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Stale bounds → raycaster misses voxels and place falls through to the edit plane.
    mesh.boundingSphere = null;
    mesh.computeBoundingSphere();
    return mesh;
  }

  _uploadGreedy(existing, pack, material, chunkKey, kind) {
    const vertCount = pack.vertexCount | 0;
    if (vertCount <= 0 || !(pack.indices?.length)) {
      this._releaseMesh(existing);
      return null;
    }
    if (existing?.isInstancedMesh) {
      this._releaseMesh(existing);
      existing = null;
    }
    let mesh = existing;
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      mesh.frustumCulled = true;
      mesh.userData.chunkKey = chunkKey;
      mesh.userData.kind = kind;
      mesh.userData.meshMode = "greedy";
      this.group.add(mesh);
    } else {
      mesh.material = material;
      mesh.userData.meshMode = "greedy";
    }
    const geo = mesh.geometry;
    geo.setAttribute("position", new THREE.BufferAttribute(pack.positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(pack.normals, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(pack.colors, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(pack.uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(pack.indices, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    mesh.count = pack.count | 0;
    mesh.userData.quadCount = pack.quadCount | 0;
    return mesh;
  }

  _syncChunkEdges(entry) {
    if (entry.edges) {
      this.group.remove(entry.edges);
      entry.edges.geometry?.dispose?.();
      entry.edges = null;
    }
    // Build edges whenever borders are on; LOD only toggles visibility (no remesh on orbit).
    // Exception: skip edge geometry on far/hidden when LOD is active (memory); rebuild when
    // the chunk later becomes near via markDirty + content sync or ensureNearEdges.
    if (!this.borders || !entry.solidKeys.length) return;
    if (!this._wantChunkBorders(entry)) return;

    const edgePositions = [];
    const box = [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ];
    const edgesIdx = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    for (const key of entry.solidKeys) {
      const [x, y, z] = key.split("|").map(Number);
      const cx = (x + 0.5) * CELL;
      const cy = (y + 0.5) * CELL;
      const cz = (z + 0.5) * CELL;
      for (const [a, b] of edgesIdx) {
        edgePositions.push(
          box[a][0] + cx,
          box[a][1] + cy,
          box[a][2] + cz,
          box[b][0] + cx,
          box[b][1] + cy,
          box[b][2] + cz
        );
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
    const lines = new THREE.LineSegments(geo, this._edgeMat);
    lines.userData.chunkKey = entry.key;
    lines.renderOrder = 3;
    lines.frustumCulled = true;
    this.group.add(lines);
    entry.edges = lines;
    this._applyEdgeVisibility(entry);
  }

  _disposeChunk(chunkKey) {
    const entry = this._chunks.get(chunkKey);
    if (!entry) return;
    this._releaseInstanced(entry.solid);
    this._releaseInstanced(entry.ghost);
    if (entry.edges) {
      this.group.remove(entry.edges);
      entry.edges.geometry?.dispose?.();
    }
    this._chunks.delete(chunkKey);
  }

  setRollOver(cell, colorHex, visible) {
    if (!visible || !cell) {
      if (this.rollOver.visible) this._needsDraw = true;
      this.rollOver.visible = false;
      return;
    }
    // Prefer unified place-preview path when available (neon + contacts).
    this.setPreviewCells([cell], colorHex);
    this.rollOver.visible = false;
    this._needsDraw = true;
  }

  /**
   * Ghost preview for brushes / shapes / strokes / single place.
   * Dark glass fill + neon pink edges + cyan contact faces against existing voxels.
   * @param {Array<{x:number,y:number,z:number}>|null} cells
   * @param {string} [colorHex]
   */
  setPreviewCells(cells, colorHex = "#c4e070") {
    while (this._previewMeshes.length) {
      const m = this._previewMeshes.pop();
      this._previewGroup.remove(m);
    }
    if (!cells?.length) {
      if (this._previewMesh) {
        this._previewMesh.count = 0;
        this._previewMesh.visible = false;
      }
      if (this._previewAuraMesh) {
        this._previewAuraMesh.count = 0;
        this._previewAuraMesh.visible = false;
      }
      if (this._previewEdgeLines) {
        this._previewEdgeLines.count = 0;
        this._previewEdgeLines.visible = false;
      }
      if (this._previewContactMesh) {
        this._previewContactMesh.count = 0;
        this._previewContactMesh.visible = false;
      }
      this._needsDraw = true;
      return;
    }

    const n = cells.length;
    const mat = this._previewMaterial(colorHex);
    if (!this._previewMesh || this._previewCapacity < n) {
      if (this._previewMesh) this._previewGroup.remove(this._previewMesh);
      if (this._previewAuraMesh) this._previewGroup.remove(this._previewAuraMesh);
      if (this._previewEdgeLines) this._previewGroup.remove(this._previewEdgeLines);
      this._previewCapacity = Math.max(n, Math.ceil(n * 1.5), 32);
      this._previewMesh = new THREE.InstancedMesh(this._boxGeo, mat, this._previewCapacity);
      this._previewMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this._previewMesh.frustumCulled = false;
      this._previewMesh.renderOrder = 6;
      this._previewGroup.add(this._previewMesh);

      // Neon wire edges (InstancedMesh of EdgesGeometry via LineSegments is awkward —
      // use scaled back-face shell in edge color as thick aura + real edges via helper).
      const auraMat =
        this._assetCache.getMaterial("preview:aura:neon") ||
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(this._previewAccentHex().edge),
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          depthTest: true,
          side: THREE.BackSide,
          toneMapped: false,
        });
      this._assetCache.rememberMaterial("preview:aura:neon", auraMat);
      auraMat.color.set(this._previewAccentHex().edge);
      this._previewAuraMesh = new THREE.InstancedMesh(
        this._boxGeo,
        auraMat,
        this._previewCapacity
      );
      this._previewAuraMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this._previewAuraMesh.frustumCulled = false;
      this._previewAuraMesh.renderOrder = 5;
      this._previewGroup.add(this._previewAuraMesh);

      // True edge lines: one LineSegments per cell is expensive; use InstancedMesh of thin edge boxes? 
      // Simpler: reuse EdgesGeometry with a custom instanced line approach — for N cells build merged.
      this._ensurePreviewEdgeLines(this._previewCapacity);
    } else {
      this._previewMesh.material = mat;
      if (this._previewAuraMesh?.material) {
        this._previewAuraMesh.material.color.set(this._previewAccentHex().edge);
      }
    }

    const scale = this._selScale.set(0.98, 0.98, 0.98);
    const auraScale = this._selScaleAura || (this._selScaleAura = new THREE.Vector3());
    auraScale.set(1.06, 1.06, 1.06);
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      this.cellToWorld(c.x, c.y, c.z, this._selPos);
      this._selDummy.compose(this._selPos, this._selQuat, scale);
      this._previewMesh.setMatrixAt(i, this._selDummy);
      if (this._previewAuraMesh) {
        this._selDummy.compose(this._selPos, this._selQuat, auraScale);
        this._previewAuraMesh.setMatrixAt(i, this._selDummy);
      }
    }
    this._previewMesh.count = n;
    this._previewMesh.visible = true;
    this._previewMesh.instanceMatrix.needsUpdate = true;
    if (this._previewAuraMesh) {
      this._previewAuraMesh.count = n;
      this._previewAuraMesh.visible = true;
      this._previewAuraMesh.instanceMatrix.needsUpdate = true;
    }

    this._updatePreviewEdgeLines(cells);
    this._updatePlaceContacts(cells);
    this._needsDraw = true;
  }

  _ensurePreviewEdgeLines(capacity) {
    if (this._previewEdgeLines) this._previewGroup.remove(this._previewEdgeLines);
    // Instanced edge shells: slight scale of wireframe via LineSegments not instance-friendly.
    // Use a second InstancedMesh with EdgesGeometry isn't valid — build LineSegments pool via dummy boxes edges.
    // Practical: InstancedMesh of a hollow-looking edge frame using 12 thin boxes is heavy.
    // Instead attach one shared LineSegments and update a BufferGeometry positions for up to capacity*24 verts.
    const maxSeg = capacity * 12;
    const positions = new Float32Array(maxSeg * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    const lines = new THREE.LineSegments(geo, this._previewEdgeMaterial());
    lines.frustumCulled = false;
    lines.renderOrder = 8;
    lines.userData.capacity = capacity;
    this._previewGroup.add(lines);
    this._previewEdgeLines = lines;
  }

  _updatePreviewEdgeLines(cells) {
    const n = cells.length;
    if (!this._previewEdgeLines || (this._previewEdgeLines.userData.capacity || 0) < n) {
      this._ensurePreviewEdgeLines(Math.max(n, 32));
    }
    const lines = this._previewEdgeLines;
    const pos = lines.geometry.getAttribute("position");
    const arr = pos.array;
    // Unit cube edges in local space, scaled slightly out.
    const e = 0.52;
    const edges = [
      [-e, -e, -e, e, -e, -e],
      [e, -e, -e, e, e, -e],
      [e, e, -e, -e, e, -e],
      [-e, e, -e, -e, -e, -e],
      [-e, -e, e, e, -e, e],
      [e, -e, e, e, e, e],
      [e, e, e, -e, e, e],
      [-e, e, e, -e, -e, e],
      [-e, -e, -e, -e, -e, e],
      [e, -e, -e, e, -e, e],
      [e, e, -e, e, e, e],
      [-e, e, -e, -e, e, e],
    ];
    let w = 0;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const ox = (c.x + 0.5) * CELL;
      const oy = (c.y + 0.5) * CELL;
      const oz = (c.z + 0.5) * CELL;
      for (let k = 0; k < 12; k++) {
        const ed = edges[k];
        arr[w++] = ox + ed[0] * CELL;
        arr[w++] = oy + ed[1] * CELL;
        arr[w++] = oz + ed[2] * CELL;
        arr[w++] = ox + ed[3] * CELL;
        arr[w++] = oy + ed[4] * CELL;
        arr[w++] = oz + ed[5] * CELL;
      }
    }
    pos.needsUpdate = true;
    lines.geometry.setDrawRange(0, n * 12 * 2);
    lines.visible = true;
  }

  /**
   * Cyan “snap” pads on faces where preview touches an existing voxel.
   * @param {Array<{x:number,y:number,z:number}>} cells
   */
  _updatePlaceContacts(cells) {
    const dirs = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    /** @type {Array<{x:number,y:number,z:number,sx:number,sy:number,sz:number}>} */
    const pads = [];
    const thick = 0.07;
    const face = 0.92;
    for (const c of cells) {
      for (const [dx, dy, dz] of dirs) {
        if (!this.grid.has(c.x + dx, c.y + dy, c.z + dz)) continue;
        // Pad sits on the shared face, slightly outside the preview cell toward the neighbor.
        const px = c.x + dx * 0.5;
        const py = c.y + dy * 0.5;
        const pz = c.z + dz * 0.5;
        pads.push({
          x: px,
          y: py,
          z: pz,
          sx: dx !== 0 ? thick : face,
          sy: dy !== 0 ? thick : face,
          sz: dz !== 0 ? thick : face,
        });
      }
    }

    if (!pads.length) {
      if (this._previewContactMesh) {
        this._previewContactMesh.count = 0;
        this._previewContactMesh.visible = false;
      }
      return;
    }

    const n = pads.length;
    const mat = this._previewContactMaterial();
    if (!this._previewContactMesh || this._previewContactCapacity < n) {
      if (this._previewContactMesh) this._previewGroup.remove(this._previewContactMesh);
      this._previewContactCapacity = Math.max(n, Math.ceil(n * 1.5), 16);
      this._previewContactMesh = new THREE.InstancedMesh(
        this._contactFaceGeo,
        mat,
        this._previewContactCapacity
      );
      this._previewContactMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this._previewContactMesh.frustumCulled = false;
      this._previewContactMesh.renderOrder = 9;
      this._previewGroup.add(this._previewContactMesh);
    } else {
      this._previewContactMesh.material = mat;
    }

    for (let i = 0; i < n; i++) {
      const p = pads[i];
      // cellToWorld for integer cells; contacts use half-steps — place manually.
      this._selPos.set((p.x + 0.5) * CELL, (p.y + 0.5) * CELL, (p.z + 0.5) * CELL);
      this._selScale.set(p.sx * CELL, p.sy * CELL, p.sz * CELL);
      this._selDummy.compose(this._selPos, this._selQuat, this._selScale);
      this._previewContactMesh.setMatrixAt(i, this._selDummy);
    }
    this._previewContactMesh.count = n;
    this._previewContactMesh.visible = true;
    this._previewContactMesh.instanceMatrix.needsUpdate = true;
  }

  clearPreviewCells() {
    this.setPreviewCells(null);
  }

  /**
   * Highlight selected voxel keys — rAF-throttled, capacity-reuse InstancedMesh.
   * Steady (non-pulsing) committed selection. Does not touch volume chunk meshes.
   * @param {Iterable<string>|string[]|null} keys
   */
  setSelectionKeys(keys) {
    const list = keys ? [...keys] : [];
    const sig = list.length ? `${list.length}\0${list[0]}\0${list[list.length - 1]}` : "";
    if (sig === this._selectSig && list.length === (this._selectPending?.length ?? this._selectMesh?.count ?? 0)) {
      // Cheap skip when signature matches last flush and no pending rewrite.
      if (!this._selectPending && this._selectMesh) return;
    }
    this._selectPending = list;
    this._selectPendingSig = sig;
    if (this._selectRaf) return;
    this._selectRaf = requestAnimationFrame(() => {
      this._selectRaf = 0;
      this._flushSelectionOverlay();
    });
  }

  _flushSelectionOverlay() {
    const list = this._selectPending || [];
    this._selectPending = null;
    this._selectSig = this._selectPendingSig || "";
    if (!list.length) {
      if (this._selectMesh) {
        this._selectMesh.count = 0;
        this._selectMesh.visible = false;
      }
      return;
    }
    const n = list.length;
    const mat =
      this._assetCache.getMaterial("select:overlay") ||
      new THREE.MeshBasicMaterial({
        color: 0xffee66,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
    this._assetCache.rememberMaterial("select:overlay", mat);
    if (!this._selectMesh || this._selectCapacity < n) {
      if (this._selectMesh) this._selectGroup.remove(this._selectMesh);
      this._selectCapacity = Math.max(n, Math.ceil(n * 1.5), 64);
      this._selectMesh = new THREE.InstancedMesh(this._boxGeo, mat, this._selectCapacity);
      this._selectMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this._selectMesh.frustumCulled = false;
      this._selectMesh.renderOrder = 4;
      this._selectGroup.add(this._selectMesh);
    }
    const scale = this._selScale.set(1.06, 1.06, 1.06);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = String(list[i]).split("|").map(Number);
      this.cellToWorld(x, y, z, this._selPos);
      this._selDummy.compose(this._selPos, this._selQuat, scale);
      this._selectMesh.setMatrixAt(i, this._selDummy);
    }
    this._selectMesh.count = n;
    this._selectMesh.visible = true;
    this._selectMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Live Shift+drag marquee preview — soft AABB + capped glowing voxel instances.
   * Pulses opacity via a dedicated rAF; never remeshes the volume.
   * @param {Iterable<string>|string[]|null} keys
   */
  setSelectDragPreview(keys) {
    const list = keys ? [...keys] : [];
    const sig = list.length ? `${list.length}\0${list[0]}\0${list[list.length - 1]}` : "";
    if (sig === this._dragSig && this._dragPreviewGroup.visible) {
      this._ensureDragPulse();
      return;
    }
    this._dragPendingKeys = list;
    this._dragPendingSig = sig;
    if (this._dragFlushRaf) return;
    this._dragFlushRaf = requestAnimationFrame(() => {
      this._dragFlushRaf = 0;
      this._flushSelectDragPreview();
    });
  }

  clearSelectDragPreview() {
    this._dragPendingKeys = [];
    this._dragPendingSig = "";
    this._dragSig = "";
    if (this._dragFlushRaf) {
      cancelAnimationFrame(this._dragFlushRaf);
      this._dragFlushRaf = 0;
    }
    this._dragPreviewGroup.visible = false;
    if (this._dragInstMesh) {
      this._dragInstMesh.count = 0;
      this._dragInstMesh.visible = false;
    }
    this._stopDragPulse();
  }

  _flushSelectDragPreview() {
    const list = this._dragPendingKeys || [];
    this._dragPendingKeys = null;
    this._dragSig = this._dragPendingSig || "";
    if (!list.length) {
      this._dragPreviewGroup.visible = false;
      if (this._dragInstMesh) {
        this._dragInstMesh.count = 0;
        this._dragInstMesh.visible = false;
      }
      this._stopDragPulse();
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const nShow = Math.min(list.length, this._dragInstCap);
    if (!this._dragInstMesh || this._dragInstCapacity < nShow) {
      if (this._dragInstMesh) this._dragPreviewGroup.remove(this._dragInstMesh);
      this._dragInstCapacity = Math.max(nShow, Math.ceil(nShow * 1.5), 32);
      this._dragInstMesh = new THREE.InstancedMesh(
        this._boxGeo,
        this._dragVoxelMat,
        this._dragInstCapacity
      );
      this._dragInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this._dragInstMesh.frustumCulled = false;
      this._dragInstMesh.renderOrder = 5;
      this._dragPreviewGroup.add(this._dragInstMesh);
    }

    const scale = this._selScale.set(1.04, 1.04, 1.04);
    for (let i = 0; i < list.length; i++) {
      const [x, y, z] = String(list[i]).split("|").map(Number);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
      if (i < nShow) {
        this.cellToWorld(x, y, z, this._selPos);
        this._selDummy.compose(this._selPos, this._selQuat, scale);
        this._dragInstMesh.setMatrixAt(i, this._selDummy);
      }
    }

    this._dragInstMesh.count = nShow;
    this._dragInstMesh.visible = nShow > 0;
    this._dragInstMesh.instanceMatrix.needsUpdate = true;

    // Soft AABB fill + edge outline around the drag range (cell-space → world).
    const sx = maxX - minX + 1;
    const sy = maxY - minY + 1;
    const sz = maxZ - minZ + 1;
    const cx = (minX + maxX + 1) * 0.5 * CELL;
    const cy = (minY + maxY + 1) * 0.5 * CELL;
    const cz = (minZ + maxZ + 1) * 0.5 * CELL;
    this._dragFillMesh.position.set(cx, cy, cz);
    this._dragFillMesh.scale.set(sx * CELL * 1.02, sy * CELL * 1.02, sz * CELL * 1.02);
    this._dragEdgeMesh.position.copy(this._dragFillMesh.position);
    this._dragEdgeMesh.scale.copy(this._dragFillMesh.scale);

    this._dragPreviewGroup.visible = true;
    this._ensureDragPulse();
  }

  _ensureDragPulse() {
    if (this._dragPulseOn) return;
    this._dragPulseOn = true;
    const tick = (t) => {
      if (!this._dragPulseOn) {
        this._dragPulseRaf = 0;
        return;
      }
      const wave = 0.5 + 0.5 * Math.sin(t * 0.007);
      this._dragFillMat.opacity = 0.06 + 0.12 * wave;
      this._dragVoxelMat.opacity = 0.12 + 0.22 * wave;
      this._dragEdgeMat.opacity = 0.45 + 0.45 * wave;
      this._dragPulseRaf = requestAnimationFrame(tick);
    };
    this._dragPulseRaf = requestAnimationFrame(tick);
  }

  _stopDragPulse() {
    this._dragPulseOn = false;
    if (this._dragPulseRaf) {
      cancelAnimationFrame(this._dragPulseRaf);
      this._dragPulseRaf = 0;
    }
  }

  /**
   * Resolve voxel key from a raycast hit (InstancedMesh or greedy surface mesh).
   */
  keyFromHit(hit) {
    if (!hit?.object) return null;
    if (hit.object.userData?.voxelKey) return hit.object.userData.voxelKey;
    const chunkKey = hit.object.userData?.chunkKey;
    if (chunkKey == null) return null;
    const entry = this._chunks.get(chunkKey);
    if (!entry) return null;
    const kind = hit.object.userData.kind;
    const keys = kind === "ghost" ? entry.ghostKeys : entry.solidKeys;

    // Legacy full-cube instances.
    if (hit.object.isInstancedMesh && hit.instanceId != null) {
      const fromId = keys[hit.instanceId];
      if (fromId) return fromId;
    }

    // Greedy mesh / instance-id miss: step into the face along -normal to land inside a cell.
    if (hit.face && hit.point) {
      const n = hit.face.normal;
      const p = this._pickScratch.copy(hit.point);
      p.x -= n.x * 0.01;
      p.y -= n.y * 0.01;
      p.z -= n.z * 0.01;
      const cell = this.worldToCell(p);
      const k = voxelKey(cell.x, cell.y, cell.z);
      if (keys.includes(k) || this.grid.has(cell.x, cell.y, cell.z)) return k;
      // Fallback: try without epsilon (hit exactly on boundary).
      const cell2 = this.worldToCell(hit.point);
      const k2 = voxelKey(cell2.x, cell2.y, cell2.z);
      if (keys.includes(k2) || this.grid.has(cell2.x, cell2.y, cell2.z)) return k2;
    }

    // Last resort for instances: cell from hit point alone.
    if (hit.point) {
      const cell3 = this.worldToCell(hit.point);
      const k3 = voxelKey(cell3.x, cell3.y, cell3.z);
      if (this.grid.has(cell3.x, cell3.y, cell3.z)) return k3;
    }
    return null;
  }

  /** Intersection targets: edit plane + chunk meshes (greedy or instanced). */
  getPickables() {
    const list = [this.editPlane];
    for (const entry of this._chunks.values()) {
      if (entry.solid) list.push(entry.solid);
      if (entry.ghost) list.push(entry.ghost);
    }
    return list;
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = 0;
    }
    if (this._selectRaf) cancelAnimationFrame(this._selectRaf);
    this._selectRaf = 0;
    if (this._dragFlushRaf) cancelAnimationFrame(this._dragFlushRaf);
    this._dragFlushRaf = 0;
    this._stopDragPulse();
    this._stopWorker();
    this.clearPreviewCells();
    this.clearSelectDragPreview();
    if (this._previewMesh) {
      this._previewGroup.remove(this._previewMesh);
      this._previewMesh = null;
    }
    if (this._previewAuraMesh) {
      this._previewGroup.remove(this._previewAuraMesh);
      this._previewAuraMesh = null;
    }
    if (this._previewEdgeLines) {
      this._previewGroup.remove(this._previewEdgeLines);
      this._previewEdgeLines.geometry?.dispose?.();
      this._previewEdgeLines = null;
    }
    if (this._previewContactMesh) {
      this._previewGroup.remove(this._previewContactMesh);
      this._previewContactMesh = null;
    }
    this._contactFaceGeo?.dispose?.();
    this._edgeLineGeo?.dispose?.();
    this._selectPending = [];
    this._flushSelectionOverlay();
    for (const key of [...this._chunks.keys()]) this._disposeChunk(key);
    this.scene.remove(this.group);
    this.scene.remove(this._previewGroup);
    this.scene.remove(this._selectGroup);
    this.scene.remove(this._dragPreviewGroup);
    this._dragFillMat.dispose();
    this._dragEdgeMat.dispose();
    this._dragVoxelMat.dispose();
    this._dragFillMesh.geometry?.dispose?.();
    this._dragEdgeGeo?.dispose?.();
    this.scene.remove(this.rollOver);
    this.scene.remove(this.editPlane);
    this._disposeGridHelper();
    this.scene.remove(this.sliceHelper);
    this._boxGeo.dispose();
    this._edgeGeo.dispose();
    this._edgeMat.dispose();
    this._solidMat.dispose();
    this._ghostMat.dispose();
    this.editPlane.geometry?.dispose?.();
    this.sliceHelper?.traverse?.((obj) => {
      obj.geometry?.dispose?.();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
      else m?.dispose?.();
    });
    // Keep AssetCache materials across dispose of one editor; local map only.
    this._matCache.clear();
    this._chunks.clear();
  }
}

/**
 * @typedef {object} ChunkEntry
 * @property {string} key
 * @property {THREE.Mesh|THREE.InstancedMesh|null} solid
 * @property {THREE.Mesh|THREE.InstancedMesh|null} ghost
 * @property {THREE.LineSegments|null} edges
 * @property {string[]} solidKeys
 * @property {string[]} ghostKeys
 * @property {number} pendingReq
 * @property {number} capacity
 * @property {'near'|'far'|'hidden'} [lodTier]
 * @property {boolean} [lodVisible]
 * @property {'greedy'|'instances'} [meshMode]
 */

export { CELL };
