/**
 * Last-used + favourite color swatches (localStorage).
 */

import { normalizeHex } from "./hsb.js";

export const LAST_COLORS_KEY = "voxie3d.lastColors";
export const FAV_COLORS_KEY = "voxie3d.favColors";
export const LAST_MAX = 12;
export const FAV_MAX = 16;

function loadList(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map((h) => normalizeHex(h)))].filter(Boolean);
  } catch {
    return [];
  }
}

function saveList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (err) {
    console.warn("[Voxie3D] swatch save failed", err);
  }
  return list;
}

export function loadLastColors() {
  return loadList(LAST_COLORS_KEY).slice(0, LAST_MAX);
}

export function loadFavouriteColors() {
  return loadList(FAV_COLORS_KEY).slice(0, FAV_MAX);
}

/** Push hex to front of last-used (deduped). */
export function rememberLastColor(hex) {
  const h = normalizeHex(hex);
  const next = [h, ...loadLastColors().filter((c) => c !== h)].slice(0, LAST_MAX);
  return saveList(LAST_COLORS_KEY, next);
}

export function toggleFavouriteColor(hex) {
  const h = normalizeHex(hex);
  const cur = loadFavouriteColors();
  const has = cur.includes(h);
  const next = has ? cur.filter((c) => c !== h) : [h, ...cur].slice(0, FAV_MAX);
  saveList(FAV_COLORS_KEY, next);
  return { list: next, added: !has };
}

export function isFavouriteColor(hex) {
  return loadFavouriteColors().includes(normalizeHex(hex));
}

export function createSwatchStore() {
  return {
    getLast: loadLastColors,
    getFavourites: loadFavouriteColors,
    remember: rememberLastColor,
    toggleFavourite: toggleFavouriteColor,
    isFavourite: isFavouriteColor,
  };
}
