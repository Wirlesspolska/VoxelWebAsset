import * as THREE from "three";

/**
 * RGB axis helper at origin (volume center): X red, Y green, Z blue.
 * Visual-only — never added to paint pickables.
 */
export function createAxisGizmo(scene, opts = {}) {
  const length = Number.isFinite(opts.length) ? opts.length : 4;
  const headLength = length * 0.22;
  const headWidth = length * 0.12;
  const group = new THREE.Group();
  group.name = "voxie3d-axis-gizmo";
  group.renderOrder = 3;

  const origin = new THREE.Vector3(0, 0, 0);
  const x = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    origin,
    length,
    0xe74c3c,
    headLength,
    headWidth
  );
  const y = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    origin,
    length,
    0x2ecc71,
    headLength,
    headWidth
  );
  const z = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    origin,
    length,
    0x3498db,
    headLength,
    headWidth
  );

  for (const arrow of [x, y, z]) {
    arrow.cone.raycast = () => {};
    arrow.line.raycast = () => {};
    group.add(arrow);
  }

  // Tiny origin marker
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(length * 0.04, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xf5f5f0 })
  );
  hub.raycast = () => {};
  group.add(hub);

  group.visible = opts.visible !== false;
  scene.add(group);

  let pulse = 0;
  let animate = opts.animate !== false;

  function setVisible(on) {
    group.visible = !!on;
    return group.visible;
  }

  function getVisible() {
    return group.visible;
  }

  function setAnimate(on) {
    animate = !!on;
    group.scale.set(1, 1, 1);
  }

  function setLength(len) {
    // Rebuild is heavier; scale group instead for simple resize feedback.
    const s = Math.max(0.25, (Number(len) || length) / length);
    group.scale.setScalar(s);
  }

  /** Follow orbit pivot / volume center. */
  function setPosition(x, y, z) {
    if (x && typeof x === "object") {
      group.position.set(x.x || 0, x.y || 0, x.z || 0);
    } else {
      group.position.set(x || 0, y || 0, z || 0);
    }
  }

  function update(dt = 0.016) {
    if (!group.visible || !animate) return;
    pulse += dt;
    const s = 1 + Math.sin(pulse * 2.2) * 0.03;
    group.scale.setScalar(s);
  }

  function dispose() {
    scene.remove(group);
    group.traverse((obj) => {
      obj.geometry?.dispose?.();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
      else m?.dispose?.();
    });
  }

  return {
    group,
    setVisible,
    getVisible,
    setAnimate,
    setLength,
    setPosition,
    update,
    dispose,
  };
}
