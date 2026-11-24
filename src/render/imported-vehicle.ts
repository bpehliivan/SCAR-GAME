
import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { VehicleId } from "@/core/garage";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CAR } from "@/core/car-spec";
import type { Quality } from "@/core/types";
import { preparePorscheFenders } from "./porsche-fenders";
import { finishFerrariUndercarriage } from "./ferrari-undercarriage";
import { addVehicleUndertray } from "./vehicle-undertray";
import { addImportedPlates } from "./vehicle-plate";
import { softVehiclePaint } from "./vehicle-paint";
import { DetailedVehicleModel } from "./detailed-vehicles";
import type { RoadsterVisualState } from "./roadster-model";

type ImportedId = Exclude<VehicleId, "tesla_roadster">;

const modelAssets = {
  bmw_7_series: () => import("@/assets/bmw-serie-7.glb?inline"),
  renault_clio_iv: () => import("@/assets/clio-iv.glb?inline"),
  ferrari_599: () => import("@/assets/ferrari-599.glb?inline"),
  mercedes_truck: () => import("@/assets/mercedes-truck.glb?inline"),
  audi_a7: () => import("@/assets/audi-a7.glb?inline"),
  amg_gt: () => import("@/assets/amg-gt.glb?inline"),
  cyberbeast: () => import("@/assets/cyberbeast.glb?inline"),
  police_usa: () => import("@/assets/police-usa.glb?inline"),
  xiaomi_yu7: () => import("@/assets/xiaomi-yu7.glb?inline"),
  porsche_911: () => import("@/assets/porsche-911.glb?inline"),
} satisfies Record<ImportedId, () => Promise<{ default: string }>>;

const BMW_BODY_PANELS = new Set(["l2", "bo", "dd8", "dd3", "d2", "d3", "dd7", "dd2", "d1", "d5"]);

const modelCache = new Map<ImportedId, Promise<THREE.Group>>();

async function loadBmwTextures(root: THREE.Group): Promise<void> {
  const [details, tires] = await Promise.all([
    import("@/assets/bmw7-4714.jpg?inline"),
    import("@/assets/bmw7-5717.jpg?inline"),
  ]);
  const textureLoader = new THREE.TextureLoader();
  const [detailMap, tireMap] = await Promise.all([
    textureLoader.loadAsync(details.default),
    textureLoader.loadAsync(tires.default),
  ]);
  for (const map of [detailMap, tireMap]) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
  }
  root.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    const slots = Array.isArray(part.material) ? part.material : [part.material];
    for (const material of slots) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.name === "Details atlas") material.map = detailMap;
      if (material.name === "Tire atlas") material.map = tireMap;
    }
  });
}

function loadModel(id: ImportedId): Promise<THREE.Group> {
  const cached = modelCache.get(id);
  if (cached) return cached;
  const pending = modelAssets[id]().then(async (asset) => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const { scene } = await loader.loadAsync(asset.default);
    if (id === "bmw_7_series") await loadBmwTextures(scene);
    if (id === "ferrari_599") finishFerrariUndercarriage(scene);
    if (id === "porsche_911") preparePorscheFenders(scene);
    const tuned = new Set<THREE.MeshStandardMaterial>();
    scene.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      const slots = Array.isArray(part.material) ? part.material : [part.material];
      for (const material of slots) {
        if (!(material instanceof THREE.MeshStandardMaterial) || tuned.has(material)) continue;
        tuned.add(material);
        material.envMapIntensity = 0.42;
        material.roughness = Math.max(material.roughness, 0.42);
        if (/glass|covers/i.test(material.name)) {
          material.envMapIntensity = 0.24;
          material.color.multiplyScalar(0.52);
        }
      }
    });
    addVehicleUndertray(scene, id);
    addImportedPlates(scene, id);
    return scene;
  }).catch((error: unknown) => {
    modelCache.delete(id);
    throw error;
  });
  modelCache.set(id, pending);
  return pending;
}

export class ImportedVehicleModel {
  readonly root = new THREE.Group();
  readonly nozzles: readonly THREE.Object3D[];
  readonly wheels: readonly THREE.Object3D[];
  readonly ready: Promise<void>;

  private readonly fallback: DetailedVehicleModel;
  private readonly wheelsAnimated: THREE.Object3D[] = [];
  private imported: THREE.Group | null = null;
  private paint: THREE.MeshPhysicalMaterial | null = null;
  private color: string;
  private disposed = false;

  constructor(private readonly id: ImportedId, quality: Quality, color: string) {
    this.color = color;
    this.fallback = new DetailedVehicleModel("bmw_7_series", quality, color, true);
    this.nozzles = this.fallback.nozzles;
    this.wheels = this.fallback.wheels;
    this.root.add(this.fallback.root);
    this.ready = this.install();
  }

  private async install(): Promise<void> {
    try {
      const template = await loadModel(this.id);
      if (this.disposed) return;
      const model = template.clone();
      const paint = softVehiclePaint(new THREE.MeshPhysicalMaterial({
        color: this.color,
        metalness: 0.26,
        roughness: 0.52,
        clearcoat: 0.20,
        clearcoatRoughness: 0.46,
        envMapIntensity: 0.48,
        side: THREE.DoubleSide,
      }));
      model.traverse((part) => {
        if (part.name.startsWith("wheel-")) this.wheelsAnimated.push(part);
        if (!(part instanceof THREE.Mesh) || part.parent?.name.startsWith("wheel-")) return;
        if (this.id === "bmw_7_series" && BMW_BODY_PANELS.has(part.name)) {
          part.material = paint;
        } else if (Array.isArray(part.material)) {
          part.material = part.material.map((slot) => slot.name === "Body paint" ? paint : slot);
        } else if (part.material.name === "Body paint") {
          part.material = paint;
        }
      });
      model.position.y = -CAR.comHeight;
      this.paint = paint;
      this.imported = model;
      this.fallback.root.visible = false;
      this.root.add(model);
    } catch (error) {
      console.warn(`Araç modeli yüklenemedi: ${this.id}`, error);
    }
  }

  setPaintColor(hex: string): void {
    this.color = hex;
    this.paint?.color.set(hex);
    this.fallback.setPaintColor(hex);
  }

  update(dt: number, state: RoadsterVisualState): void {
    this.fallback.update(dt, state);
    if (!this.imported) return;
    this.imported.position.y = -CAR.comHeight - state.suspension * 0.04;
    for (const wheel of this.wheelsAnimated) wheel.rotation.z = -state.wheelSpin;
  }

  dispose(): void {
    this.disposed = true;
    this.paint?.dispose();
    this.fallback.dispose();
    this.root.removeFromParent();
  }
}

