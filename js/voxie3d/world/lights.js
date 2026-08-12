/**
 * User-placed world lights. Ambient-only until at least one light exists.
 * Shadow maps stay off unless shadows are enabled AND a light is present.
 */

import * as THREE from "three";

/**
 * @typedef {'sun'|'point'} LightKind
 * @typedef {{ id: string, kind: LightKind, x: number, y: number, z: number, intensity?: number, color?: string }} LightDef
 */

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {THREE.AmbientLight} deps.ambient
 * @param {() => boolean} deps.getShadowsPref
 * @param {(on:boolean)=>void} deps.setShadowMapEnabled
 * @param {(on:boolean)=>void} [deps.setLitMaterials]
 * @param {() => void} [deps.markNeedsDraw]
 */
export function createLightController(deps) {
  const { scene, ambient, getShadowsPref, setShadowMapEnabled, setLitMaterials, markNeedsDraw } =
    deps;

  /** @type {Map<string, { def: LightDef, light: THREE.Light, helper: THREE.Object3D|null }>} */
  const lights = new Map();
  let idSeq = 1;

  function notifyDraw() {
    markNeedsDraw?.();
  }

  function syncLightingMode() {
    const has = lights.size > 0;
    // Ambient-only until a user light exists (brighter fill when empty).
    ambient.intensity = has ? 0.55 : 1.15;
    const shadowsOn = has && !!getShadowsPref() && !!(lights.size);
    setShadowMapEnabled(!!shadowsOn);
    setLitMaterials?.(has);
    for (const entry of lights.values()) {
      if ("castShadow" in entry.light) {
        entry.light.castShadow = shadowsOn && entry.def.kind === "sun";
      }
    }
    notifyDraw();
    return has;
  }

  function makeHelper(kind, color) {
    const group = new THREE.Group();
    group.name = "voxie3d-light-marker";
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color || "#fff5e0"),
      depthTest: true,
    });
    if (kind === "sun") {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mat);
      group.add(core);
    } else {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat);
      group.add(core);
    }
    return group;
  }

  /**
   * @param {Partial<LightDef> & { kind?: LightKind }} opts
   */
  function placeLight(opts = {}) {
    const kind = opts.kind === "point" ? "point" : "sun";
    const id = opts.id || `light_${idSeq++}`;
    const def = {
      id,
      kind,
      x: Number.isFinite(opts.x) ? opts.x : 4,
      y: Number.isFinite(opts.y) ? opts.y : 10,
      z: Number.isFinite(opts.z) ? opts.z : 6,
      intensity: Number.isFinite(opts.intensity) ? opts.intensity : kind === "sun" ? 1.35 : 1.1,
      color: opts.color || (kind === "sun" ? "#fff5e0" : "#ffe8c8"),
    };

    removeLight(id);

    /** @type {THREE.Light} */
    let light;
    if (kind === "sun") {
      const sun = new THREE.DirectionalLight(def.color, def.intensity);
      sun.position.set(def.x, def.y, def.z);
      sun.castShadow = false;
      sun.shadow.mapSize.set(512, 512);
      light = sun;
    } else {
      const pt = new THREE.PointLight(def.color, def.intensity, 48, 2);
      pt.position.set(def.x, def.y, def.z);
      pt.castShadow = false;
      light = pt;
    }
    light.name = `voxie3d-${kind}-${id}`;
    scene.add(light);
    const helper = makeHelper(kind, def.color);
    helper.position.set(def.x, def.y, def.z);
    scene.add(helper);
    lights.set(id, { def, light, helper });
    syncLightingMode();
    return { ...def };
  }

  function removeLight(id) {
    const entry = lights.get(id);
    if (!entry) return false;
    scene.remove(entry.light);
    entry.light.dispose?.();
    if (entry.helper) {
      scene.remove(entry.helper);
      entry.helper.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
    }
    lights.delete(id);
    syncLightingMode();
    return true;
  }

  function clearLights() {
    for (const id of [...lights.keys()]) removeLight(id);
    syncLightingMode();
  }

  function listLights() {
    return [...lights.values()].map((e) => ({ ...e.def }));
  }

  function hasLights() {
    return lights.size > 0;
  }

  /** Re-apply shadow map flag when prefs change. */
  function refreshShadows() {
    return syncLightingMode();
  }

  /**
   * Soft biome fog (lightweight — not a shader graph).
   * @param {string|null} hex
   * @param {number} [density]
   */
  function setBiomeFog(hex, density = 0) {
    if (!hex || !(density > 0)) {
      scene.fog = null;
      notifyDraw();
      return null;
    }
    // Exp2 fog — cheap, optional tint.
    const nearish = Math.max(0.0008, density * 0.012);
    scene.fog = new THREE.FogExp2(new THREE.Color(hex).getHex(), nearish);
    notifyDraw();
    return { hex, density };
  }

  function dispose() {
    clearLights();
    scene.fog = null;
  }

  // Boot: ambient-only, no default sun.
  syncLightingMode();

  return {
    placeLight,
    removeLight,
    clearLights,
    listLights,
    hasLights,
    refreshShadows,
    setBiomeFog,
    dispose,
  };
}
