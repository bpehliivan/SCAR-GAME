import * as THREE from "three";
import { softVehiclePaint } from "./vehicle-paint";
import { CAR, NOZZLE_POSITIONS, WHEEL_CENTERS } from "@/core/car-spec";
import { clamp } from "@/core/math";
import type { Quality } from "@/core/types";
import { getVehiclePreset, type VehicleId } from "@/core/garage";
import { RoadsterModel, type RoadsterVisualState } from "./roadster-model";

export interface DetailedWheelEntry {
  pivot: THREE.Group;
  spinMesh: THREE.Group;
}

export class DetailedVehicleModel {
  readonly root = new THREE.Group();
  readonly nozzles: readonly THREE.Object3D[];
  readonly wheels: readonly THREE.Object3D[];
  readonly vehicleId: VehicleId;

  private readonly bodyGroup = new THREE.Group();
  private readonly wheelEntries: DetailedWheelEntry[] = [];
  private readonly paintMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly tailLightMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly allMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly wheelRadius: number;
  private readonly heaveAmount = 0.045;
  private readonly roadster: RoadsterModel | null;

  constructor(
    vehicleId: VehicleId,
    _quality: Quality,
    paintHex?: string,
    private readonly player = false
  ) {
    this.vehicleId = vehicleId;
    const preset = getVehiclePreset(vehicleId);
    this.wheelRadius = preset.wheelRadius;
    this.root.name = `vehicle-${vehicleId}`;
    // Use the existing purpose-built Tesla geometry instead of stretching the BMW sedan.
    if (vehicleId === "tesla_roadster") {
      this.roadster = new RoadsterModel(_quality);
      this.root.add(this.roadster.root);
      this.nozzles = this.roadster.nozzles;
      this.wheels = this.roadster.wheels;
      this.roadster.setPaintColor(paintHex ?? preset.defaultColor);
      return;
    }
    this.roadster = null;

    const initialColor = new THREE.Color(paintHex ?? preset.defaultColor);

    const bmwPaint = new THREE.MeshStandardMaterial({
      name: "BMW 7 paint",
      color: initialColor.clone(),
      roughness: 0.24,
      metalness: 0.48,
    });

    const secondaryPaintMat = new THREE.MeshStandardMaterial({
      name: "BMW 7 secondary paint",
      color: initialColor.clone().multiplyScalar(0.84),
      roughness: 0.3,
      metalness: 0.44,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      name: "Trim dark",
      color: new THREE.Color("#14171d"),
      roughness: 0.62,
      metalness: 0.18,
    });

    const seeThroughGlass = new THREE.MeshStandardMaterial({
      name: "BMW 7 cabin glass",
      color: new THREE.Color("#162232"),
      roughness: 0.12,
      metalness: 0.25,
      transparent: true,
      opacity: 0.34,
    });

    const seatMat = new THREE.MeshStandardMaterial({
      name: "BMW 7 leather seat",
      color: new THREE.Color("#2b2623"),
      roughness: 0.65,
      metalness: 0.08,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      name: "Chrome detail",
      color: new THREE.Color("#e2e8f0"),
      roughness: 0.18,
      metalness: 0.92,
    });

    const tireMat = new THREE.MeshStandardMaterial({
      name: "Tire rubber",
      color: new THREE.Color("#16181c"),
      roughness: 0.88,
      metalness: 0.06,
    });

    const rimMat = new THREE.MeshStandardMaterial({
      name: "Alloy rim",
      color: new THREE.Color("#cbd5e1"),
      roughness: 0.24,
      metalness: 0.86,
    });

    const headlightMat = new THREE.MeshStandardMaterial({
      name: "Headlight emissive",
      color: new THREE.Color("#f8fafc"),
      emissive: new THREE.Color("#bae6fd"),
      emissiveIntensity: 0.29,
      roughness: 0.15,
    });

    const tailLightMat = new THREE.MeshStandardMaterial({
      name: "Tail light emissive",
      color: new THREE.Color("#ef4444"),
      emissive: new THREE.Color("#dc2626"),
      emissiveIntensity: 0.28,
      roughness: 0.2,
    });

    this.paintMaterials.push(bmwPaint, secondaryPaintMat);
    this.paintMaterials.forEach((material) => softVehiclePaint(material));
    this.tailLightMaterials.push(tailLightMat);
    this.allMaterials.push(
      bmwPaint,
      secondaryPaintMat,
      trimMat,
      seeThroughGlass,
      seatMat,
      chromeMat,
      tireMat,
      rimMat,
      headlightMat,
      tailLightMat
    );

    const addPart = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      pos: [number, number, number],
      rot: [number, number, number] = [0, 0, 0],
      name = "part"
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    this.bodyGroup.name = "chassis-bmw_7_series";
    this.bodyGroup.scale.set(...preset.bodyScale);
    this.root.add(this.bodyGroup);

    // Uzun sedan gövde kabuğu (pahlı ExtrudeGeometry)
    const sedanShape = new THREE.Shape();
    sedanShape.moveTo(-2.35, 0.34);
    sedanShape.lineTo(2.38, 0.34);
    sedanShape.quadraticCurveTo(2.48, 0.38, 2.46, 0.62);
    sedanShape.quadraticCurveTo(2.35, 0.82, 1.92, 0.88);
    sedanShape.lineTo(1.05, 0.96);
    sedanShape.quadraticCurveTo(0.45, 1.34, -0.18, 1.36);
    sedanShape.lineTo(-1.42, 1.34);
    sedanShape.quadraticCurveTo(-1.98, 1.24, -2.32, 0.88);
    sedanShape.quadraticCurveTo(-2.42, 0.66, -2.35, 0.34);

    const sedanGeo = new THREE.ExtrudeGeometry(sedanShape, {
      depth: 1.62,
      bevelEnabled: true,
      bevelSegments: 5,
      steps: 1,
      bevelSize: 0.12,
      bevelThickness: 0.12,
      curveSegments: 14,
    });
    sedanGeo.translate(0, 0, -0.81);
    addPart(this.bodyGroup, sedanGeo, bmwPaint, [0, 0, 0], [0, 0, 0], "bmw7-body");

    // Ön ve arka koltuklar + başlıklar (motor detayı olmadan kabin görünüş detayı)
    for (const rowX of [0.22, -0.68]) {
      for (const side of [-1, 1]) {
        const seatCushion = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, 0.14, 0.46),
          seatMat
        );
        seatCushion.position.set(rowX, 0.66, side * 0.42);
        this.bodyGroup.add(seatCushion);

        const seatBack = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.46, 0.44),
          seatMat
        );
        seatBack.position.set(rowX - 0.18, 0.92, side * 0.42);
        seatBack.rotation.z = 0.14;
        this.bodyGroup.add(seatBack);

        const headrest = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.14, 0.22),
          seatMat
        );
        headrest.position.set(rowX - 0.22, 1.21, side * 0.42);
        this.bodyGroup.add(headrest);
      }
    }

    // Ön cam, arka cam ve yan camlar
    addPart(
      this.bodyGroup,
      new THREE.BoxGeometry(0.88, 0.03, 1.52),
      seeThroughGlass,
      [0.68, 1.15, 0],
      [0, 0, -0.56],
      "bmw7-windshield"
    );
    addPart(
      this.bodyGroup,
      new THREE.BoxGeometry(0.84, 0.03, 1.48),
      seeThroughGlass,
      [-1.72, 1.12, 0],
      [0, 0, 0.54],
      "bmw7-rear-glass"
    );

    for (const side of [-1, 1]) {
      addPart(
        this.bodyGroup,
        new THREE.BoxGeometry(1.96, 0.36, 0.03),
        seeThroughGlass,
        [-0.42, 1.12, side * 0.86],
        [0, 0, 0],
        "bmw7-side-glass"
      );
      // İkonik çift böbrek ön ızgara
      addPart(
        this.bodyGroup,
        new THREE.BoxGeometry(0.12, 0.28, 0.44),
        chromeMat,
        [2.46, 0.72, side * 0.26],
        [0, 0, 0],
        "bmw7-kidney-grille"
      );
      addPart(
        this.bodyGroup,
        new THREE.BoxGeometry(0.13, 0.24, 0.36),
        trimMat,
        [2.47, 0.72, side * 0.26],
        [0, 0, 0],
        "bmw7-kidney-inner"
      );
      // Ön far ve arka stop lambaları
      addPart(
        this.bodyGroup,
        new THREE.BoxGeometry(0.24, 0.12, 0.34),
        headlightMat,
        [2.36, 0.74, side * 0.68],
        [0, side * -0.18, 0],
        "bmw7-headlamp"
      );
      addPart(
        this.bodyGroup,
        new THREE.BoxGeometry(0.16, 0.14, 0.42),
        tailLightMat,
        [-2.42, 0.78, side * 0.66],
        [0, 0, 0],
        "bmw7-taillamp"
      );
      // Kapı kolları ve yan aynalar
      for (const hx of [0.22, -0.72]) {
        addPart(
          this.bodyGroup,
          new THREE.BoxGeometry(0.16, 0.04, 0.05),
          chromeMat,
          [hx, 0.82, side * 0.94],
          [0, 0, 0],
          "bmw7-handle"
        );
      }
      addPart(
        this.bodyGroup,
        new THREE.BoxGeometry(0.22, 0.12, 0.22),
        bmwPaint,
        [0.78, 0.96, side * 1.02],
        [0, 0, 0],
        "bmw7-mirror"
      );
    }

    const wheelPositions: Array<{ key: string; x: number; z: number }> = [
      { key: "fl", x: WHEEL_CENTERS[0][0], z: -0.92 },
      { key: "fr", x: WHEEL_CENTERS[1][0], z: 0.92 },
      { key: "rl", x: WHEEL_CENTERS[2][0], z: -0.92 },
      { key: "rr", x: WHEEL_CENTERS[3][0], z: 0.92 },
    ];

    const tireGeo = new THREE.CylinderGeometry(
      this.wheelRadius,
      this.wheelRadius,
      0.24,
      28
    );
    tireGeo.rotateX(Math.PI / 2);

    const rimGeo = new THREE.CylinderGeometry(
      this.wheelRadius * 0.64,
      this.wheelRadius * 0.64,
      0.25,
      20
    );
    rimGeo.rotateX(Math.PI / 2);

    for (const wp of wheelPositions) {
      const pivot = new THREE.Group();
      pivot.name = `wheel-pivot-${wp.key}`;
      pivot.position.set(wp.x, this.wheelRadius, wp.z);

      const spinMesh = new THREE.Group();
      spinMesh.name = `wheel-spin-${wp.key}`;

      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      tire.receiveShadow = true;
      spinMesh.add(tire);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      spinMesh.add(rim);

      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.026, this.wheelRadius * 0.92, 6, 10),
          rimMat
        );
        spoke.rotation.z = (s / 5) * Math.PI * 2;
        spoke.position.z = Math.sign(wp.z) * 0.11;
        spinMesh.add(spoke);
      }

      const hubCap = new THREE.Mesh(
        new THREE.CylinderGeometry(
          this.wheelRadius * 0.18,
          this.wheelRadius * 0.18,
          0.04,
          16
        ),
        chromeMat
      );
      hubCap.rotation.x = Math.PI / 2;
      hubCap.position.z = Math.sign(wp.z) * 0.125;
      spinMesh.add(hubCap);

      pivot.add(spinMesh);
      this.root.add(pivot);
      this.wheelEntries.push({ pivot, spinMesh });
    }

    this.nozzles = NOZZLE_POSITIONS.map(([x, y, z], i) => {
      const anchor = new THREE.Object3D();
      anchor.name = `nozzle-${i}`;
      anchor.position.set(x, y, z);
      this.root.add(anchor);
      return anchor;
    });

    this.wheels = this.wheelEntries.map((entry) => entry.spinMesh);
  }

  setPaintColor(hex: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    if (this.roadster) {
      this.roadster.setPaintColor(hex);
      return;
    }
    const paint = new THREE.Color(hex);
    this.paintMaterials.forEach((material, index) => {
      material.color.copy(index === 0 ? paint : paint.clone().multiplyScalar(0.84));
    });
  }

  update(_dt: number, state: RoadsterVisualState): void {
    if (this.roadster) {
      this.roadster.update(_dt, state);
      return;
    }
    const heave = -this.heaveAmount * clamp(state.suspension, -1, 1);
    const ground = this.player ? -CAR.comHeight : 0;
    this.bodyGroup.position.y = ground + heave;

    const rollAngle = -state.wheelSpin;
    for (const entry of this.wheelEntries) {
      entry.pivot.position.y = ground + this.wheelRadius + heave * 0.45;
      entry.spinMesh.rotation.z = rollAngle;
    }

    const brake = clamp(state.brake, 0, 1);
    for (const tailMat of this.tailLightMaterials) {
      tailMat.emissiveIntensity = 0.28 + brake * 0.65;
    }
  }

  dispose(): void {
    if (this.roadster) {
      this.roadster.dispose();
      this.root.removeFromParent();
      return;
    }
    const geometries = new Set<THREE.BufferGeometry>();
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        geometries.add(obj.geometry);
      }
    });
    for (const geo of geometries) {
      geo.dispose();
    }
    for (const mat of this.allMaterials) {
      mat.dispose();
    }
    this.root.removeFromParent();
  }
}
