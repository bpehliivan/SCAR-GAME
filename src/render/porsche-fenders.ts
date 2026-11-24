
import * as THREE from "three";

/** Assign the imported front fender surfaces their own paint slot. */
export function preparePorscheFenders(scene: THREE.Group): void {
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (const piece of scene.getObjectsByProperty("type", "Mesh")) {
    if (!(piece instanceof THREE.Mesh) || Array.isArray(piece.material) || piece.material.name !== "Trim") continue;
    const geometry = piece.geometry;
    const index = geometry.index;
    if (!index) continue;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const painted: number[] = [];
    const trim: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      let x = 0, y = 0, z = 0, upward = 0;
      for (let corner = 0; corner < 3; corner++) {
        const vertex = index.getX(i + corner);
        point.fromBufferAttribute(positions, vertex);
        normal.fromBufferAttribute(normals, vertex);
        x += point.x / 3;
        y += point.y / 3;
        z += point.z / 3;
        upward += normal.y / 3;
      }
      const exposed = x > 1.04 && Math.abs(z) > 0.56 && y > 0.37 && y < 0.98 && upward > -0.36;
      const target = exposed ? painted : trim;
      target.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
    if (!painted.length) continue;
    const partition = geometry.clone();
    const sorted = new (index.array instanceof Uint32Array ? Uint32Array : Uint16Array)(index.count);
    sorted.set(trim);
    sorted.set(painted, trim.length);
    partition.setIndex(new THREE.BufferAttribute(sorted, 1));
    partition.clearGroups();
    partition.addGroup(0, trim.length, 0);
    partition.addGroup(trim.length, painted.length, 1);
    const paintSlot = new THREE.MeshStandardMaterial({ name: "Body paint" });
    piece.geometry = partition;
    piece.material = [piece.material, paintSlot];
    geometry.dispose();
  }
}

