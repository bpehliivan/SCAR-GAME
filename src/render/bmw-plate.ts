
import * as THREE from "three";

type PlateSide = "front" | "rear";

function isPlateVertex(position: THREE.BufferAttribute, uv: THREE.BufferAttribute, i: number, side: PlateSide): boolean {
  const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
  if (Math.abs(z) >= 0.261 || uv.getX(i) <= 0.498) return false;
  const v = uv.getY(i);
  return side === "front"
    ? x > 2.45 && y > 0.347 && y < 0.50 && v > -0.008 && v < 0.131
    : x < -2.41 && y > 0.743 && y < 0.87 && v > 0.98 && v < 1.131;
}

/** Keep the model's actual plate mounts and replace just their atlas artwork. */
export function replaceBmwPlates(scene: THREE.Group, material: THREE.Material): number {
  let replaced = 0;
  const meshes = scene.getObjectsByProperty("type", "Mesh");
  for (const object of meshes) {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.material.name !== "Details atlas") continue;
    const geometry = object.geometry;
    const index = geometry.index;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    if (!index || !uv) continue;
    const plates: Record<PlateSide, number[]> = { front: [], rear: [] };
    const detail: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const side = vertices.every((v) => isPlateVertex(position, uv, v, "front")) ? "front"
        : vertices.every((v) => isPlateVertex(position, uv, v, "rear")) ? "rear" : null;
      (side ? plates[side] : detail).push(...vertices);
    }
    for (const side of ["front", "rear"] as const) {
      const vertices = plates[side];
      if (!vertices.length) continue;
      const coordinates: number[] = [];
      const bounds = new THREE.Box3();
      for (const i of vertices) {
        const point = new THREE.Vector3().fromBufferAttribute(position, i);
        bounds.expandByPoint(point);
        coordinates.push(point.x, point.y, point.z);
      }
      const plateGeometry = new THREE.BufferGeometry();
      const width = bounds.max.z - bounds.min.z;
      const height = bounds.max.y - bounds.min.y;
      const textureCoordinates = vertices.flatMap((i) => [
        side === "front" ? (bounds.max.z - position.getZ(i)) / width : (position.getZ(i) - bounds.min.z) / width,
        (position.getY(i) - bounds.min.y) / height,
      ]);
      plateGeometry.setAttribute("position", new THREE.Float32BufferAttribute(coordinates, 3));
      plateGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(textureCoordinates, 2));
      plateGeometry.computeVertexNormals();
      const plate = new THREE.Mesh(plateGeometry, material);
      plate.name = "Player license plate";
      object.add(plate);
      replaced++;
    }
    if (detail.length !== index.count) {
      geometry.setIndex(detail);
      geometry.clearGroups();
    }
  }
  return replaced;
}

