import * as THREE from "three";
import type { VehicleId } from "@/core/garage";

interface Undertray {
  height: number;
  stations: readonly [x: number, halfWidth: number][];
}

const layouts: Partial<Record<VehicleId, Undertray>> = {
  porsche_911: {
    height: 0.143,
    stations: [
      [-2.22, 0.56], [-1.92, 0.74], [-1.61, 0.60], [-0.90, 0.60],
      [-0.64, 0.86], [0.69, 0.83], [0.95, 0.58], [1.65, 0.58],
      [1.95, 0.76], [2.24, 0.61],
    ],
  },
  audi_a7: {
    height: 0.205,
    stations: [
      [-2.27, 0.56], [-1.78, 0.64], [-0.99, 0.60], [-0.65, 0.84],
      [0.90, 0.84], [1.13, 0.58], [1.90, 0.58], [2.25, 0.62],
    ],
  },
  police_usa: {
    height: 0.158,
    stations: [
      [-2.44, 0.59], [-1.96, 0.71], [-1.84, 0.60], [-1.12, 0.60],
      [-0.78, 0.81], [0.86, 0.81], [1.19, 0.59], [1.99, 0.59], [2.42, 0.62],
    ],
  },
};

export function addVehicleUndertray(model: THREE.Group, id: VehicleId): void {
  const layout = layouts[id];
  if (!layout) return;

  const points = [
    ...layout.stations.map(([x, width]) => new THREE.Vector2(x, width)),
    ...layout.stations.map(([x, width]) => new THREE.Vector2(x, -width)).reverse(),
  ];
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: 0.052,
    bevelSize: 0.012,
    bevelThickness: 0.009,
    bevelSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  const tray = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: "#24272b", roughness: 0.91, metalness: 0.09,
  }));
  tray.name = "Underbody protection panel";
  tray.position.y = layout.height;
  model.add(tray);
}
