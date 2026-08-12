/**
 * VXP1 — stub for proxy / part assemblies (future).
 *
 * Schema (planned, not fully implemented):
 * {
 *   magic: 'VXP1',
 *   name?: string,
 *   // Proxy parts: references to volume/part assets + transform
 *   parts: [
 *     {
 *       id: string,
 *       // kind: 'volume' | 'vxw' | 'ref'
 *       // pathOrKey?: string,
 *       // offset?: {x,y,z},
 *       // rotation?: {x,y,z},
 *     }
 *   ],
 *   meta?: object
 * }
 *
 * Use serializeVxpStub() only as a placeholder document for tooling.
 */

export const VXP_MAGIC = "VXP1";

export function isVxp(raw) {
  return !!(raw && typeof raw === "object" && raw.magic === VXP_MAGIC);
}

/**
 * Minimal stub document — schema comment above; no runtime assembly yet.
 * @param {{ name?: string }} [opts]
 */
export function serializeVxpStub(opts = {}) {
  /** @type {Record<string, unknown>} */
  const doc = {
    magic: VXP_MAGIC,
    parts: [],
    meta: { stub: true, note: "Proxy part assembly — reserved for later" },
  };
  if (typeof opts.name === "string" && opts.name) doc.name = opts.name;
  return doc;
}

export function parseVxp(raw) {
  const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isVxp(doc)) {
    throw new Error("Not a VXP1 document (missing magic:'VXP1')");
  }
  return {
    magic: VXP_MAGIC,
    name: typeof doc.name === "string" ? doc.name : undefined,
    parts: Array.isArray(doc.parts) ? doc.parts : [],
    meta: doc.meta && typeof doc.meta === "object" ? { ...doc.meta } : {},
  };
}
