
import * as THREE from "three";
import { replaceBmwPlates } from "./bmw-plate";
import { DEFAULT_PLATE } from "@/core/driver-profile";

let plateText = DEFAULT_PLATE;

function drawPlate(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#d2d6d8";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = "#2a3039";
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = "#213f75";
    ctx.fillRect(10, 10, 55, 108);
    ctx.fillStyle = "#e6ebf3";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TR", 37, 91);
    ctx.fillStyle = "#14171d";
    ctx.font = "bold 65px Arial";
    ctx.fillText(plateText, 282, 67, 420);
  }
}

export function createPlateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  drawPlate(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const platePositions: Record<string, readonly [rearX: number, rearY: number, frontX: number, frontY: number]> = {
  bmw_7_series: [-2.52, 0.71, 2.56, 0.55],
  renault_clio_iv: [-2.12, 0.64, 2.12, 0.49],
  ferrari_599: [-2.34, 0.50, 2.34, 0.46],
  mercedes_truck: [-3.22, 0.69, 3.22, 0.74],
  audi_a7: [-2.43, 0.64, 2.43, 0.53],
  amg_gt: [-2.37, 0.59, 2.37, 0.49],
  cyberbeast: [-2.83, 0.68, 2.83, 0.52],
  police_usa: [-2.62, 0.62, 2.62, 0.53],
  xiaomi_yu7: [-2.51, 0.65, 2.51, 0.50],
  porsche_911: [-2.37, 0.52, 2.37, 0.45],
};

let sharedMaterial: THREE.MeshStandardMaterial | undefined;
export function setPlayerPlate(value: string): void {
  plateText = value;
  const map = sharedMaterial?.map;
  if (map) {
    drawPlate(map.image as HTMLCanvasElement);
    map.needsUpdate = true;
  }
}

const plateGeometry = new THREE.PlaneGeometry(0.51, 0.128);

export function addImportedPlates(scene: THREE.Group, id: string): void {
  const positions = platePositions[id];
  if (!positions) return;
  sharedMaterial ??= new THREE.MeshStandardMaterial({
    map: createPlateTexture(),
    color: "#b2b5b7",
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  if (id === "bmw_7_series" && replaceBmwPlates(scene, sharedMaterial)) return;
  for (const [x, y] of [[positions[0], positions[1]], [positions[2], positions[3]]]) {
    const plate = new THREE.Mesh(plateGeometry, sharedMaterial);
    plate.name = "Player license plate";
    plate.position.set(x, y, 0);
    plate.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(plate);
  }
}

