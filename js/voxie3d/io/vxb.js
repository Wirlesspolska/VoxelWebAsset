/**
 * VXB1 / VXBIN1 — binary voxel volume (.vxb).
 *
 * Much smaller/faster than JSON for dense or large assets.
 *
 * Layout (little-endian):
 *   0   magic[4]        "VXB1"
 *   4   version u16     = 1  (VXBIN1)
 *   6   flags u16
 *         bit0  palette indices (else packed RGB)
 *         bit1  RLE runs along +X (same y,z,color)
 *         bit2  mode=world (else part)
 *   8   sizeX i32
 *  12   sizeY i32
 *  16   sizeZ i32
 *  20   voxelScale f32  (1 / 2 / 4 export scale)
 *  24   voxelCount u32  (decoded voxel count)
 *  28   paletteCount u16
 *  30   reserved u16
 *  32   axis u8         0=x 1=y 2=z
 *  33   slice i16
 *  35   partIdLen u8
 *  36   partId utf8[partIdLen]
 *       pad to 4-byte alignment
 *       palette: paletteCount × {u8 r,g,b}
 *       body:
 *         flat palette: voxelCount × {i16 x,y,z, u16 idx}
 *         flat RGB:     voxelCount × {i16 x,y,z, u8 r,g,b, pad}
 *         RLE palette:  runCount u32 + runs × {i16 x0,y,z, u16 len, u16 idx}
 *         RLE RGB:      runCount u32 + runs × {i16 x0,y,z, u16 len, u8 r,g,b, pad}
 *
 * Prefer when voxel count > BINARY_VOXEL_THRESHOLD (5k) or user picks Export binary.
 * JSON / VXW stay for small/readable authoring.
 */

export const VXB_MAGIC = "VXB1";
/** Documented format name (version 1). */
export const VXBIN_VERSION = 1;
export const BINARY_VOXEL_THRESHOLD = 5000;

export const VXB_FLAG_PALETTE = 1 << 0;
export const VXB_FLAG_RLE = 1 << 1;
export const VXB_FLAG_WORLD = 1 << 2;

export const EXPORT_SCALES = [1, 2, 4];

export const FORMAT_SPECTRUM = [
  { id: "json", label: "JSON", note: "Small volumes; human-readable" },
  { id: "vxw", label: "VXW", note: "World package (JSON); small–medium" },
  { id: "vxb", label: "VXB", note: "Binary VXBIN1 for large / dense assets" },
];

const AXIS_TO_U8 = { x: 0, y: 1, z: 2 };
const U8_TO_AXIS = ["x", "y", "z"];

function hexToRgbBytes(hex) {
  const h = String(hex || "#888888").replace("#", "");
  const full = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, c | 0)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function colorKey(hex) {
  const [r, g, b] = hexToRgbBytes(hex);
  return (r << 16) | (g << 8) | b;
}

function asUint8(buf) {
  if (!buf) return null;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  if (ArrayBuffer.isView(buf)) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return null;
}

function writeMagic(view, magic) {
  const enc = new TextEncoder();
  const mag = enc.encode(magic);
  for (let i = 0; i < 4; i++) view.setUint8(i, mag[i] || 0);
}

function readMagic(u8) {
  return String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
}

function pad4(n) {
  return (n + 3) & ~3;
}

/**
 * @param {object} volume normalizeVolume-like
 * @returns {boolean}
 */
export function shouldPreferBinary(volume, threshold = BINARY_VOXEL_THRESHOLD) {
  const n = Array.isArray(volume?.voxels) ? volume.voxels.length : 0;
  return n > threshold;
}

/**
 * Scale voxel coordinates for JSON/VXW/VXB export (game import normalize).
 * @param {object} volume
 * @param {1|2|4} scale
 */
export function scaleVolumeCoords(volume, scale = 1) {
  const s = [1, 2, 4].includes(scale) ? scale : 1;
  if (s === 1) {
    return {
      ...volume,
      meta: { ...(volume.meta || {}), exportScale: 1 },
    };
  }
  const ws = volume.worldSize || { x: volume.size, y: volume.size, z: volume.size };
  return {
    ...volume,
    size: (ws.x | 0) * s,
    worldSize: { x: (ws.x | 0) * s, y: (ws.y | 0) * s, z: (ws.z | 0) * s },
    voxels: (volume.voxels || []).map((v) => ({
      ...v,
      x: (v.x | 0) * s,
      y: (v.y | 0) * s,
      z: (v.z | 0) * s,
    })),
    meta: {
      ...(volume.meta || {}),
      exportScale: s,
      sourceWorldSize: { ...ws },
    },
  };
}

function buildPalette(voxels) {
  /** @type {Map<number, number>} */
  const map = new Map();
  /** @type {[number,number,number][]} */
  const palette = [];
  for (const v of voxels) {
    const key = colorKey(v.color);
    if (!map.has(key)) {
      map.set(key, palette.length);
      palette.push(hexToRgbBytes(v.color));
    }
  }
  return { map, palette };
}

/**
 * Build +X RLE runs (same y,z,color). Returns null if RLE is not smaller.
 * @param {{x:number,y:number,z:number,color:string}[]} voxels
 * @param {Map<number, number>} colorMap
 */
function buildRleRuns(voxels, colorMap) {
  if (!voxels.length) return [];
  const sorted = voxels
    .map((v) => ({
      x: v.x | 0,
      y: v.y | 0,
      z: v.z | 0,
      idx: colorMap.get(colorKey(v.color)) ?? 0,
    }))
    .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x || a.idx - b.idx);

  /** @type {{x0:number,y:number,z:number,len:number,idx:number}[]} */
  const runs = [];
  let cur = { ...sorted[0], len: 1 };
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i];
    if (v.y === cur.y && v.z === cur.z && v.idx === cur.idx && v.x === cur.x + cur.len) {
      cur.len += 1;
      if (cur.len > 0xffff) {
        runs.push({ x0: cur.x, y: cur.y, z: cur.z, len: 0xffff, idx: cur.idx });
        cur = { x: cur.x + 0xffff, y: cur.y, z: cur.z, idx: cur.idx, len: cur.len - 0xffff };
      }
    } else {
      runs.push({ x0: cur.x, y: cur.y, z: cur.z, len: cur.len, idx: cur.idx });
      cur = { ...v, len: 1 };
    }
  }
  runs.push({ x0: cur.x, y: cur.y, z: cur.z, len: cur.len, idx: cur.idx });
  return runs;
}

/**
 * @param {object} volume normalizeVolume-like
 * @param {{ scale?: number, rle?: boolean, forceRgb?: boolean }} [opts]
 * @returns {ArrayBuffer}
 */
export function serializeVxb(volume, opts = {}) {
  const scale = [1, 2, 4].includes(opts.scale) ? opts.scale : 1;
  const scaled = scale !== 1 ? scaleVolumeCoords(volume, scale) : volume;
  const ws = scaled.worldSize || {
    x: scaled.size || 24,
    y: scaled.size || 24,
    z: scaled.size || 24,
  };
  const voxels = Array.isArray(scaled.voxels) ? scaled.voxels : [];
  const { map, palette } = buildPalette(voxels);
  const usePalette = !opts.forceRgb && palette.length > 0 && palette.length <= 65535;
  const runs = opts.rle === false ? null : buildRleRuns(voxels, map);
  const flatBytes = voxels.length * (usePalette ? 8 : 10);
  const rleBytes = runs ? 4 + runs.length * (usePalette ? 10 : 12) : Infinity;
  const useRle = !!runs && rleBytes < flatBytes;

  let flags = 0;
  if (usePalette) flags |= VXB_FLAG_PALETTE;
  if (useRle) flags |= VXB_FLAG_RLE;
  if (scaled.mode === "world") flags |= VXB_FLAG_WORLD;

  const partId = String(scaled.partId || "part_main").slice(0, 200);
  const partBytes = new TextEncoder().encode(partId);
  const partIdLen = Math.min(255, partBytes.length);

  let headerEnd = 36 + partIdLen;
  headerEnd = pad4(headerEnd);
  const palBytes = usePalette ? palette.length * 3 : 0;
  const bodyStart = headerEnd + palBytes;
  const bodyBytes = useRle
    ? 4 + runs.length * (usePalette ? 10 : 12)
    : voxels.length * (usePalette ? 8 : 10);
  const buf = new ArrayBuffer(bodyStart + bodyBytes);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  writeMagic(view, VXB_MAGIC);
  view.setUint16(4, VXBIN_VERSION, true);
  view.setUint16(6, flags, true);
  view.setInt32(8, ws.x | 0, true);
  view.setInt32(12, ws.y | 0, true);
  view.setInt32(16, ws.z | 0, true);
  view.setFloat32(20, scale, true);
  view.setUint32(24, voxels.length, true);
  view.setUint16(28, usePalette ? palette.length : 0, true);
  view.setUint16(30, 0, true);
  view.setUint8(32, AXIS_TO_U8[scaled.axis] ?? 2);
  view.setInt16(33, (scaled.slice | 0), true);
  view.setUint8(35, partIdLen);
  u8.set(partBytes.subarray(0, partIdLen), 36);

  let o = headerEnd;
  if (usePalette) {
    for (const [r, g, b] of palette) {
      u8[o++] = r;
      u8[o++] = g;
      u8[o++] = b;
    }
  }

  if (useRle) {
    view.setUint32(o, runs.length, true);
    o += 4;
    for (const run of runs) {
      view.setInt16(o, run.x0, true); o += 2;
      view.setInt16(o, run.y, true); o += 2;
      view.setInt16(o, run.z, true); o += 2;
      view.setUint16(o, run.len, true); o += 2;
      if (usePalette) {
        view.setUint16(o, run.idx, true); o += 2;
      } else {
        const [r, g, b] = palette[run.idx] || [136, 136, 136];
        u8[o++] = r;
        u8[o++] = g;
        u8[o++] = b;
        u8[o++] = 0;
      }
    }
  } else {
    for (const v of voxels) {
      view.setInt16(o, v.x | 0, true); o += 2;
      view.setInt16(o, v.y | 0, true); o += 2;
      view.setInt16(o, v.z | 0, true); o += 2;
      if (usePalette) {
        view.setUint16(o, map.get(colorKey(v.color)) ?? 0, true); o += 2;
      } else {
        const [r, g, b] = hexToRgbBytes(v.color);
        u8[o++] = r;
        u8[o++] = g;
        u8[o++] = b;
        u8[o++] = 0;
      }
    }
  }

  return buf;
}

export function isVxb(buf) {
  const u8 = asUint8(buf);
  if (!u8 || u8.byteLength < 8) return false;
  return readMagic(u8) === VXB_MAGIC;
}

/**
 * @param {ArrayBuffer|ArrayBufferView} buf
 * @returns {object} normalizeVolume-like
 */
export function parseVxb(buf) {
  const u8 = asUint8(buf);
  if (!u8 || !isVxb(u8)) throw new Error("Not a VXB1 / VXBIN1 buffer");
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  const version = view.getUint16(4, true);
  if (version !== VXBIN_VERSION) {
    throw new Error(`Unsupported VXB version ${version}`);
  }

  const flags = view.getUint16(6, true);
  const sizeX = view.getInt32(8, true);
  const sizeY = view.getInt32(12, true);
  const sizeZ = view.getInt32(16, true);
  const voxelScale = view.getFloat32(20, true);
  const voxelCount = view.getUint32(24, true);
  const paletteCount = view.getUint16(28, true);
  const axis = U8_TO_AXIS[view.getUint8(32)] || "z";
  const slice = view.getInt16(33, true);
  const partIdLen = view.getUint8(35);
  const partId =
    partIdLen > 0
      ? new TextDecoder().decode(u8.subarray(36, 36 + partIdLen))
      : "part_main";

  let o = pad4(36 + partIdLen);
  const usePalette = !!(flags & VXB_FLAG_PALETTE);
  const useRle = !!(flags & VXB_FLAG_RLE);
  const mode = flags & VXB_FLAG_WORLD ? "world" : "part";

  /** @type {string[]} */
  const palette = [];
  if (usePalette) {
    for (let i = 0; i < paletteCount; i++) {
      palette.push(rgbToHex(u8[o], u8[o + 1], u8[o + 2]));
      o += 3;
    }
  }

  /** @type {{x:number,y:number,z:number,color:string,partId:string}[]} */
  const voxels = [];

  if (useRle) {
    const runCount = view.getUint32(o, true);
    o += 4;
    for (let i = 0; i < runCount; i++) {
      const x0 = view.getInt16(o, true); o += 2;
      const y = view.getInt16(o, true); o += 2;
      const z = view.getInt16(o, true); o += 2;
      const len = view.getUint16(o, true); o += 2;
      let color;
      if (usePalette) {
        const idx = view.getUint16(o, true); o += 2;
        color = palette[idx] || "#888888";
      } else {
        color = rgbToHex(u8[o], u8[o + 1], u8[o + 2]);
        o += 4;
      }
      for (let dx = 0; dx < len; dx++) {
        voxels.push({ x: x0 + dx, y, z, color, partId });
      }
    }
  } else {
    for (let i = 0; i < voxelCount; i++) {
      const x = view.getInt16(o, true); o += 2;
      const y = view.getInt16(o, true); o += 2;
      const z = view.getInt16(o, true); o += 2;
      let color;
      if (usePalette) {
        const idx = view.getUint16(o, true); o += 2;
        color = palette[idx] || "#888888";
      } else {
        color = rgbToHex(u8[o], u8[o + 1], u8[o + 2]);
        o += 4;
      }
      voxels.push({ x, y, z, color, partId });
    }
  }

  return {
    mode,
    size: sizeX,
    worldSize: { x: sizeX, y: sizeY, z: sizeZ },
    voxels,
    axis,
    slice,
    partId,
    meta: {
      format: "VXB1",
      vxbin: VXBIN_VERSION,
      exportScale: voxelScale,
      flags,
    },
  };
}

/**
 * @param {ArrayBuffer|ArrayBufferView} buf
 * @returns {object}
 */
export function loadVxb(buf) {
  return parseVxb(buf);
}
