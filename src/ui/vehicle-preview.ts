
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoadsterModel } from "@/render/roadster-model";
import { ImportedVehicleModel } from "@/render/imported-vehicle";
import type { VehicleId } from "@/core/garage";

class VehiclePreviewStudio {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(27, 2, 0.1, 40);

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(460, 230, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.23;
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(room, 0.06).texture;
    this.scene.environmentIntensity = 0.67;
    pmrem.dispose();
    room.dispose();
    this.scene.add(new THREE.HemisphereLight(0xe1f3ff, 0x293d50, 2.45));
    const key = new THREE.DirectionalLight(0xffe7d4, 2.2);
    key.position.set(4, 7, 4);
    const fill = new THREE.DirectionalLight(0x85c9ff, 1.8);
    fill.position.set(-5, 2, -4);
    this.scene.add(key, fill);
  }

  async snapshot(id: VehicleId, color: string): Promise<string> {
    const model = id === "tesla_roadster"
      ? new RoadsterModel("low")
      : new ImportedVehicleModel(id, "low", color);
    try {
      model.setPaintColor(color);
      if (model instanceof ImportedVehicleModel) await model.ready;
      this.scene.add(model.root);
      const bounds = new THREE.Box3().setFromObject(model.root);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const distance = Math.max(size.x * 1.16, size.y * 2.8, 3);
      this.camera.position.copy(center).add(new THREE.Vector3(0.72, 0.29, 0.64).multiplyScalar(distance));
      this.camera.lookAt(center);
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL();
    } finally {
      model.dispose();
    }
  }
}

let studio: VehiclePreviewStudio | undefined;
let pending = Promise.resolve();
const previews = new Map<string, Promise<string>>();

export function requestVehiclePreview(id: VehicleId, color: string): Promise<string> {
  const key = `${id}:${color}`;
  const cached = previews.get(key);
  if (cached) return cached;
  const preview = pending.then(async () => {
    studio ??= new VehiclePreviewStudio();
    return studio.snapshot(id, color);
  });
  pending = preview.then(() => {}, () => { previews.delete(key); });
  previews.set(key, preview);
  return preview;
}

