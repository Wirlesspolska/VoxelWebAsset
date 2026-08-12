/**
 * Tiny typed-ish event bus for Voxie3D controllers.
 */
export function createEmitter() {
  /** @type {Map<string, Set<Function>>} */
  const map = new Map();

  return {
    on(type, fn) {
      if (typeof fn !== "function") return () => {};
      let set = map.get(type);
      if (!set) {
        set = new Set();
        map.set(type, set);
      }
      set.add(fn);
      return () => set.delete(fn);
    },
    off(type, fn) {
      map.get(type)?.delete(fn);
    },
    emit(type, payload) {
      const set = map.get(type);
      if (!set) return;
      for (const fn of set) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[Voxie3D] listener error (${type})`, err);
        }
      }
    },
    clear() {
      map.clear();
    },
  };
}
