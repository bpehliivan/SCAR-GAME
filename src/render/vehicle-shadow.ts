
import * as THREE from "three";
import type { CarSnapshot } from "@/core/types";

export class VehicleShadow {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    const side = 64;
    const pixels = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
        const falloff = Math.max(0, 1 - r);
        pixels[(y * side + x) * 4 + 3] = Math.round(255 * falloff ** 1.1);
      }
    }
    const map = new THREE.DataTexture(pixels, side, side);
    map.magFilter = map.minFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.45, 3.05), material);
    this.mesh.rotation.x = -Math.PI / 2;
  }

  update(car: CarSnapshot): void {
    this.mesh.visible = !car.onRamp && car.position.y > 0.35;
    this.mesh.position.set(car.position.x, 0.026, car.position.z);
    this.mesh.material.opacity = 0.78 * Math.exp(-Math.max(0, car.position.y - 0.57) * 0.23);
  }
}

