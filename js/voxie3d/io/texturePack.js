/**
 * Texture JSON packing with ~10MB shard cap.
 *
 * Shard rules:
 * - Prefer a single `textures.json` when under MAX_SHARD_BYTES (~10MB).
 * - Spill extras to textures2.json, textures3.json, …
 * - Manifest: { magic:'VXTPACK1', shards:[…], total, bytesApprox }
 * - Optional multi-file download "zip-like" pack (sequential blob downloads);
 *   true DEFLATE zip is out of scope without a dependency — hosts may zip manually.
 *
 * Each shard: { magic:'VXTSHARD1', index, textures: { [id]: TextureDef } }
 */

import { serializeTextureDef, hydrateTextureDef } from "../tools/texturizer.js";

export const TEXTURE_PACK_MAGIC = "VXTPACK1";
export const TEXTURE_SHARD_MAGIC = "VXTSHARD1";
/** Soft cap per JSON file (~10MB UTF-8). */
export const MAX_SHARD_BYTES = 10 * 1024 * 1024;

function byteLen(obj) {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch {
    return JSON.stringify(obj).length;
  }
}

function shardName(index) {
  return index <= 1 ? "textures.json" : `textures${index}.json`;
}

/**
 * Split a texture map into shard documents under the byte budget.
 * @param {Record<string, object>} textureMap id → TextureDef-like
 * @param {number} [maxBytes]
 * @returns {{ manifest: object, shards: Array<{ filename:string, doc:object }> }}
 */
export function packTextures(textureMap, maxBytes = MAX_SHARD_BYTES) {
  const entries = Object.entries(textureMap || {}).map(([id, raw]) => {
    const def = serializeTextureDef(
      raw?.weights ? raw : hydrateTextureDef({ ...raw, id }) || { id, size: 8, seed: 1, weights: [] }
    );
    return [def.id || id, def];
  });

  const shards = [];
  let current = {};
  let index = 1;

  const flush = () => {
    if (!Object.keys(current).length) return;
    const doc = {
      magic: TEXTURE_SHARD_MAGIC,
      index,
      textures: current,
    };
    shards.push({ filename: shardName(index), doc });
    index += 1;
    current = {};
  };

  for (const [id, def] of entries) {
    const trial = { ...current, [id]: def };
    const trialDoc = { magic: TEXTURE_SHARD_MAGIC, index, textures: trial };
    if (Object.keys(current).length && byteLen(trialDoc) > maxBytes) {
      flush();
    }
    current[id] = def;
    // Single oversized texture: still emit alone (cannot split further without pixel strips).
    if (byteLen({ magic: TEXTURE_SHARD_MAGIC, index, textures: current }) > maxBytes) {
      flush();
    }
  }
  flush();

  if (!shards.length) {
    shards.push({
      filename: "textures.json",
      doc: { magic: TEXTURE_SHARD_MAGIC, index: 1, textures: {} },
    });
  }

  const total = entries.length;
  const bytesApprox = shards.reduce((a, s) => a + byteLen(s.doc), 0);
  const manifest = {
    magic: TEXTURE_PACK_MAGIC,
    shards: shards.map((s) => s.filename),
    total,
    bytesApprox,
  };
  return { manifest, shards };
}

/**
 * Merge shard docs (and optional manifest) into one texture map.
 * @param {Array<object|string>} shardDocs
 */
export function mergeTextureShards(shardDocs) {
  const out = {};
  for (const raw of shardDocs || []) {
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== "object") continue;
    const map = doc.textures || (doc.magic === TEXTURE_PACK_MAGIC ? null : doc);
    if (!map || typeof map !== "object") continue;
    for (const [id, def] of Object.entries(map)) {
      const h = hydrateTextureDef({ ...def, id: def.id || id });
      if (h) out[h.id] = h;
    }
  }
  return out;
}

export function isTexturePackManifest(doc) {
  return !!(doc && doc.magic === TEXTURE_PACK_MAGIC && Array.isArray(doc.shards));
}

export function isTextureShard(doc) {
  return !!(doc && (doc.magic === TEXTURE_SHARD_MAGIC || doc.textures));
}

/**
 * Trigger browser downloads for manifest + shards (multi-file pack).
 * @param {{ manifest: object, shards: Array<{filename:string,doc:object}> }} pack
 * @param {(filename:string, data:object) => void} [downloadFn]
 */
export function downloadTexturePack(pack, downloadFn) {
  const save =
    downloadFn ||
    ((filename, data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  save("textures.manifest.json", pack.manifest);
  for (const s of pack.shards) {
    save(s.filename, s.doc);
  }
  return pack.manifest.shards.length + 1;
}
