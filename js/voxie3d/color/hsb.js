/**
 * HSB ↔ RGB/hex for Voxie3D paint color.
 */

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** @param {number} h 0–360 @param {number} s 0–100 @param {number} b 0–100 */
export function hsbToRgb(h, s, b) {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const vv = clamp(b, 0, 100) / 100;
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let r = 0;
  let g = 0;
  let bl = 0;
  if (hh < 60) [r, g, bl] = [c, x, 0];
  else if (hh < 120) [r, g, bl] = [x, c, 0];
  else if (hh < 180) [r, g, bl] = [0, c, x];
  else if (hh < 240) [r, g, bl] = [0, x, c];
  else if (hh < 300) [r, g, bl] = [x, 0, c];
  else [r, g, bl] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((bl + m) * 255),
  };
}

export function rgbToHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(clamp(r, 0, 255))}${h(clamp(g, 0, 255))}${h(clamp(b, 0, 255))}`;
}

/**
 * Canonical #rrggbb (lowercase). Accepts #rgb / #rrggbb / bare hex.
 * Invalid input falls back to #c4e070.
 */
export function normalizeHex(hex, fallback = "#c4e070") {
  const raw = String(hex ?? "").trim();
  const m3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(raw);
  if (m3) {
    return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase();
  }
  const m6 = /^#?([a-f\d]{6})$/i.exec(raw);
  if (m6) return `#${m6[1].toLowerCase()}`;
  return normalizeHex(fallback, "#c4e070");
}

export function hsbToHex(h, s, b) {
  const { r, g, b: bl } = hsbToRgb(h, s, b);
  return rgbToHex(r, g, bl);
}

export function hexToRgb(hex) {
  const n = normalizeHex(hex);
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(n);
  if (!m) return { r: 196, g: 224, b: 112 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function rgbToHsb(r, g, b) {
  const rr = clamp(r, 0, 255) / 255;
  const gg = clamp(g, 0, 255) / 255;
  const bb = clamp(b, 0, 255) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const bri = max * 100;
  return { h: Math.round(h), s: Math.round(s), b: Math.round(bri) };
}

export function hexToHsb(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsb(r, g, b);
}

export const PRESET_COLORS = [
  "#c4e070",
  "#e8e4d4",
  "#8a9078",
  "#3a4434",
  "#c07050",
  "#5080a0",
  "#d0a040",
  "#6a6a6a",
  "#2a2218",
  "#e05050",
];
