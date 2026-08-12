/**
 * VXT1 — Voxie material / texture wrapper.
 *
 * Two shapes:
 *   1) Palette:  { magic:'VXT1', type:'palette', palette:['#rrggbb', ...] }
 *   2) Atlas:    { magic:'VXT1', type:'atlas', png:'pathOrKey', tile:{w,h} }
 *
 * PNG refs are keys/paths only (browser load via file picker or later asset map).
 */

export const VXT_MAGIC = "VXT1";
export const VXT_TYPES = ["palette", "atlas"];

export function isVxt(raw) {
  return !!(raw && typeof raw === "object" && raw.magic === VXT_MAGIC);
}

function normalizeHex(c) {
  if (typeof c !== "string") return null;
  const s = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1],
      g = s[2],
      b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/**
 * @param {{ palette?: string[], name?: string }} [opts]
 */
export function serializeVxtPalette(opts = {}) {
  const palette = (Array.isArray(opts.palette) ? opts.palette : [])
    .map(normalizeHex)
    .filter(Boolean);
  /** @type {Record<string, unknown>} */
  const doc = {
    magic: VXT_MAGIC,
    type: "palette",
    palette,
  };
  if (typeof opts.name === "string" && opts.name) doc.name = opts.name;
  return doc;
}

/**
 * @param {{ png: string, tile?: {w?:number,h?:number}|number, name?: string }} opts
 */
export function serializeVxtAtlas(opts) {
  const png = typeof opts?.png === "string" ? opts.png : "";
  let tile = { w: 16, h: 16 };
  if (typeof opts?.tile === "number" && Number.isFinite(opts.tile)) {
    const n = Math.max(1, opts.tile | 0);
    tile = { w: n, h: n };
  } else if (opts?.tile && typeof opts.tile === "object") {
    tile = {
      w: Math.max(1, (opts.tile.w | 0) || 16),
      h: Math.max(1, (opts.tile.h | 0) || 16),
    };
  }
  /** @type {Record<string, unknown>} */
  const doc = {
    magic: VXT_MAGIC,
    type: "atlas",
    png,
    tile,
  };
  if (typeof opts.name === "string" && opts.name) doc.name = opts.name;
  return doc;
}

/**
 * @param {object|string} raw
 */
export function parseVxt(raw) {
  const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isVxt(doc)) {
    throw new Error("Not a VXT1 document (missing magic:'VXT1')");
  }
  const type = VXT_TYPES.includes(doc.type)
    ? doc.type
    : Array.isArray(doc.palette)
      ? "palette"
      : doc.png
        ? "atlas"
        : "palette";

  if (type === "atlas") {
    return {
      magic: VXT_MAGIC,
      type: "atlas",
      png: typeof doc.png === "string" ? doc.png : "",
      tile: {
        w: Math.max(1, (doc.tile?.w | 0) || (doc.tile | 0) || 16),
        h: Math.max(1, (doc.tile?.h | 0) || (doc.tile | 0) || 16),
      },
      name: typeof doc.name === "string" ? doc.name : undefined,
    };
  }

  const palette = (Array.isArray(doc.palette) ? doc.palette : [])
    .map(normalizeHex)
    .filter(Boolean);
  return {
    magic: VXT_MAGIC,
    type: "palette",
    palette,
    name: typeof doc.name === "string" ? doc.name : undefined,
  };
}

/**
 * Apply VXT to a voxie controller when straightforward (palette → active color).
 * Atlas PNG refs are returned for the host to resolve later.
 *
 * @param {object} voxie
 * @param {object|string} raw
 * @returns {{ applied: string, vxt: object }}
 */
export function applyVxt(voxie, raw) {
  const vxt = parseVxt(raw);
  if (vxt.type === "palette" && vxt.palette.length && voxie?.setColorHex) {
    voxie.setColorHex(vxt.palette[0]);
    return { applied: "palette", vxt };
  }
  return { applied: vxt.type === "atlas" ? "atlas-ref" : "none", vxt };
}
