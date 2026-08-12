import {
  AXES,
  clampDim,
  cloneVoxel,
  MAX_DIM,
  normalizeGroups,
  normalizeVolume,
  volumeToJSON,
} from "./serialize.js";

export function voxelKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

/**
 * In-memory voxel volume with O(1) lookup.
 * Coordinates are integer cell indices centered near origin per axis.
 */
export class VoxelGrid {
  constructor(raw = {}) {
    this._map = new Map();
    /** @type {'part'|'world'} */
    this._mode = "part";
    this._seed = null;
    this._meta = null;
    /** @type {Array<{id:string,name:string,color:string,voxelKeys:string[]}>} */
    this._groups = [];
    this.load(raw);
  }

  get groups() {
    return this._groups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      voxelKeys: [...g.voxelKeys],
    }));
  }

  /** Cubic / legacy size (X extent). Prefer worldSize for non-cubes. */
  get size() {
    return this._sizeX;
  }

  get worldSize() {
    return { x: this._sizeX, y: this._sizeY, z: this._sizeZ };
  }

  get mode() {
    return this._mode;
  }

  get seed() {
    return this._seed;
  }

  get meta() {
    return this._meta;
  }

  get axis() {
    return this._axis;
  }

  get slice() {
    return this._slice;
  }

  get partId() {
    return this._partId;
  }

  /** @deprecated Prefer halfX — kept for cubic callers. */
  get half() {
    return this.halfX;
  }

  get halfX() {
    return Math.floor(this._sizeX / 2);
  }

  get halfY() {
    return Math.floor(this._sizeY / 2);
  }

  get halfZ() {
    return Math.floor(this._sizeZ / 2);
  }

  halfOn(axis) {
    if (axis === "x") return this.halfX;
    if (axis === "y") return this.halfY;
    return this.halfZ;
  }

  load(raw) {
    const v = normalizeVolume(raw);
    this._mode = v.mode;
    this._sizeX = v.worldSize.x;
    this._sizeY = v.worldSize.y;
    this._sizeZ = v.worldSize.z;
    this._axis = v.axis;
    this._slice = this._clampSlice(v.slice);
    this._partId = v.partId;
    this._seed = Number.isFinite(v.seed) ? v.seed >>> 0 : null;
    this._meta = v.meta && typeof v.meta === "object" ? { ...v.meta } : null;
    this._groups = normalizeGroups(v.groups);
    this._map.clear();
    for (const cell of v.voxels) {
      this._map.set(voxelKey(cell.x, cell.y, cell.z), cloneVoxel(cell));
    }
  }

  setGroups(groups) {
    this._groups = normalizeGroups(groups);
    return this.groups;
  }

  setMode(mode) {
    if (mode === "part" || mode === "world") this._mode = mode;
    return this._mode;
  }

  setSeed(seed) {
    this._seed = Number.isFinite(seed) ? seed >>> 0 : null;
    return this._seed;
  }

  setMeta(meta) {
    this._meta = meta && typeof meta === "object" ? { ...meta } : null;
    return this._meta;
  }

  _clampSlice(n) {
    const h = this.halfOn(this._axis);
    return Math.max(-h, Math.min(h - 1, n | 0));
  }

  inBounds(x, y, z) {
    return (
      x >= -this.halfX &&
      x < this.halfX &&
      y >= -this.halfY &&
      y < this.halfY &&
      z >= -this.halfZ &&
      z < this.halfZ
    );
  }

  /**
   * Set explicit extents (even sizes preferred for centered coords).
   * Existing voxels outside the new bounds are dropped.
   * @param {{x?:number,y?:number,z?:number}|number} size
   */
  setWorldSize(size) {
    const cur = this.worldSize;
    const next =
      typeof size === "number"
        ? { x: clampDim(size, cur.x), y: clampDim(size, cur.y), z: clampDim(size, cur.z) }
        : {
            x: clampDim(size?.x, cur.x),
            y: clampDim(size?.y, cur.y),
            z: clampDim(size?.z, cur.z),
          };
    // Keep even so ±half is symmetric around origin (0,0,0).
    const even = (n) => (n % 2 === 0 ? n : Math.min(MAX_DIM, n + 1));
    this._sizeX = even(next.x);
    this._sizeY = even(next.y);
    this._sizeZ = even(next.z);
    for (const [key, v] of [...this._map.entries()]) {
      if (!this.inBounds(v.x, v.y, v.z)) this._map.delete(key);
    }
    this._slice = this._clampSlice(this._slice);
    return this.worldSize;
  }

  /**
   * Grow extents so cell (x,y,z) is inside the volume (centered on origin).
   * @returns {boolean} true if size changed
   */
  expandToInclude(x, y, z) {
    const needSize = (coord, half, size) => {
      let h = half;
      const c = coord | 0;
      if (c < -h) h = -c;
      if (c >= h) h = c + 1;
      let n = Math.max(size, h * 2);
      if (n % 2) n += 1;
      return Math.min(MAX_DIM, n);
    };
    const nx = needSize(x, this.halfX, this._sizeX);
    const ny = needSize(y, this.halfY, this._sizeY);
    const nz = needSize(z, this.halfZ, this._sizeZ);
    if (nx === this._sizeX && ny === this._sizeY && nz === this._sizeZ) return false;
    this._sizeX = nx;
    this._sizeY = ny;
    this._sizeZ = nz;
    this._slice = this._clampSlice(this._slice);
    return true;
  }

  setAxis(axis) {
    if (!AXES.includes(axis)) return this._axis;
    this._axis = axis;
    this._slice = this._clampSlice(this._slice);
    return this._axis;
  }

  cycleAxis() {
    const i = AXES.indexOf(this._axis);
    return this.setAxis(AXES[(i + 1) % AXES.length]);
  }

  setSlice(n) {
    this._slice = this._clampSlice(n);
    return this._slice;
  }

  nudgeSlice(delta) {
    return this.setSlice(this._slice + (delta | 0));
  }

  setPartId(id) {
    this._partId = String(id || "part_main");
  }

  has(x, y, z) {
    return this._map.has(voxelKey(x, y, z));
  }

  get(x, y, z) {
    return this._map.get(voxelKey(x, y, z)) || null;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {string|object} colorOrOpts hex or { color, partId, textureId, texScale, materialId, block }
   * @param {string} [partId]
   */
  set(x, y, z, colorOrOpts, partId = this._partId) {
    if (!this.inBounds(x, y, z)) return false;
    const opts =
      colorOrOpts && typeof colorOrOpts === "object"
        ? colorOrOpts
        : { color: colorOrOpts, partId };
    const prev = this._map.get(voxelKey(x, y, z));
    const cell = {
      x: x | 0,
      y: y | 0,
      z: z | 0,
      color: opts.color || prev?.color || "#c4e070",
      partId: String(opts.partId || partId || this._partId),
    };
    const texId = opts.textureId !== undefined ? opts.textureId : prev?.textureId;
    if (typeof texId === "string" && texId) cell.textureId = texId;
    const scale = opts.texScale !== undefined ? opts.texScale : prev?.texScale;
    if (scale === 8 || scale === 16) cell.texScale = scale;
    const mid = opts.materialId !== undefined ? opts.materialId : prev?.materialId;
    if (typeof mid === "string" && mid) cell.materialId = mid;
    // Terrain block id (grass/dirt/…) — drives atlas UVs in greedy mesh.
    const block = opts.block !== undefined ? opts.block : prev?.block;
    if (typeof block === "string" && block) cell.block = block;
    this._map.set(voxelKey(x, y, z), cell);
    return true;
  }

  remove(x, y, z) {
    return this._map.delete(voxelKey(x, y, z));
  }

  clear() {
    this._map.clear();
  }

  all() {
    return Array.from(this._map.values());
  }

  /** Axis coordinate for a voxel. */
  axisCoord(v, axis = this._axis) {
    return v[axis];
  }

  /** Bottom / base layer index for current axis. */
  baseSlice() {
    return -this.halfOn(this._axis);
  }

  /** Highest solid Y at column (x,z), or null if empty. */
  surfaceY(x, z) {
    let top = null;
    for (let y = this.halfY - 1; y >= -this.halfY; y--) {
      if (this.has(x, y, z)) {
        top = y;
        break;
      }
    }
    return top;
  }

  exportVolume() {
    return volumeToJSON({
      mode: this._mode,
      size: this._sizeX,
      worldSize: this.worldSize,
      voxels: this.all(),
      axis: this._axis,
      slice: this._slice,
      partId: this._partId,
      groups: this._groups,
      ...(this._seed != null ? { seed: this._seed } : {}),
      ...(this._meta ? { meta: this._meta } : {}),
    });
  }

  importVolume(data) {
    this.load(typeof data === "string" ? JSON.parse(data) : data);
  }
}

