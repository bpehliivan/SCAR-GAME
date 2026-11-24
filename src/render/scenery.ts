import * as THREE from "three";
import { clamp, lerp } from "@/core/math";
import type { LevelDef, Quality } from "@/core/types";
import { CURL_SEGMENTS, CURL_WIDTH } from "@/levels/backflip";
import { THEMES, type ThemeId } from "@/core/driver-profile";
import { BACKFLIP_SCENERY_CLEARANCE } from "./camera-rig";
import { buildPanorama } from "./panorama";
import { buildSpectators } from "./spectators";
import { buildLineup } from "./vehicles-model";
import { DetailedVehicleModel } from "./detailed-vehicles";

export interface ArcadePickup {
  id: number;
  x: number;
  y: number;
  z: number;
  value: number;
  collected: boolean;
  mesh: THREE.Mesh;
}

export interface ArcadeObstacle {
  id: number;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  kind: "ramp" | "traffic";
  mesh: THREE.Object3D;
  vehicleModel?: DetailedVehicleModel;
  cleared?: boolean;
}

export interface Scenery {
  readonly root: THREE.Group;
  readonly fog: THREE.FogExp2 | null;
  update(dt: number, time: number, carPos: { x: number; y: number; z: number }): void;
  dispose(): void;
  cheer?(positionX: number): void;
  resetArcade?(): void;
  consumeArcadePickups?(carPos: { x: number; y: number; z: number }): number;
  checkArcadeTrafficJumpOrHit?(
    carPos: { x: number; y: number; z: number }
  ): "none" | "jumped" | "crash";
  sampleArcadeRamp?(carPos: { x: number; y: number; z: number }): {
    onRamp: boolean;
    groundY: number;
    slopeAngle: number;
    boostFactor: number;
  };
}

function buildCurlRampVisual(
  rampMat: THREE.Material,
  edgeMat: THREE.Material
): THREE.Group {
  const curlGroup = new THREE.Group();
  curlGroup.name = "backflip-curl-ramp-visual";

  let cursorX = 0;
  let cursorY = 0;
  let angle = 0;

  for (let i = 0; i < CURL_SEGMENTS.length; i++) {
    const seg = CURL_SEGMENTS[i];
    const steps = Math.max(4, Math.ceil(seg.length / 1.5));
    const ds = seg.length / steps;

    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const kMid = seg.k0 + (seg.k1 - seg.k0) * ((t0 + t1) * 0.5);
      const nextAngle = angle + kMid * ds;

      const dx = Math.cos(angle) * ds;
      const dy = Math.sin(angle) * ds;
      const midX = cursorX + dx * 0.5;
      const midY = cursorY + dy * 0.5;
      const segLen = Math.hypot(dx, dy) + 0.08;

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(segLen, 0.35, CURL_WIDTH),
        rampMat
      );
      slab.position.set(midX, midY - 0.14, 0);
      slab.rotation.z = angle;
      curlGroup.add(slab);

      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(segLen, 0.16, 0.22),
          edgeMat
        );
        rail.position.set(midX, midY + 0.05, side * (CURL_WIDTH * 0.48));
        rail.rotation.z = angle;
        curlGroup.add(rail);
      }

      cursorX += dx;
      cursorY += dy;
      angle = nextAngle;
    }
  }

  return curlGroup;
}

function createAsphaltTexture(length: number): THREE.DataTexture {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 713;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = seed >>> 24;
    const value = 125 + Math.floor(grain * 0.34) + (grain > 246 ? 34 : 0);
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(length / 7, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function buildScenery(level: LevelDef, quality: Quality, themeId: ThemeId = "night"): Scenery {
  const theme = THEMES[themeId];
  const city = themeId === "night" || themeId === "day";
  const root = new THREE.Group();
  root.name = `scenery-${level.id}`;

  const isArcade = String(level.id) === "arcade";
  const isBackflip = String(level.id) === "backflip";
  const isKickflip = String(level.id) === "kickflip";
  const clearDistance = isBackflip ? BACKFLIP_SCENERY_CLEARANCE : isKickflip ? 34 : 0;
  const skylineDepth = (i: number): number => i < 38
    ? -Math.max(85, clearDistance + 12) - i % 4 * 12
    : Math.max(92, clearDistance + 12) + i % 5 * 15;

  // Tüm modlarda yol çizgilerinin yarım kalmaması ve ufukta kopmaması için yumuşak sis
  const fog = new THREE.FogExp2(theme.fog, 0.0022);

  const hemiLight = new THREE.HemisphereLight(0xdbeafe, theme.ground, theme.ambient);
  root.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(
    theme.light,
    theme.sun
  );
  dirLight.position.set(35, 55, 25);
  dirLight.castShadow = false;
  root.add(dirLight);

  const groundMat = new THREE.MeshStandardMaterial({
    name: "Track ground",
    color: new THREE.Color(theme.ground),
    roughness: 0.9,
    metalness: 0.05,

  });

  const trackLength = 8000;
  const roadTileLength = 64;
  const asphalt = createAsphaltTexture(roadTileLength);
  const roadMat = new THREE.MeshStandardMaterial({
    name: "Track road deck",
    color: new THREE.Color("#303744"),
    map: asphalt,
    roughness: 0.85,
    metalness: 0.08,

  });

  const laneLineMat = new THREE.MeshStandardMaterial({
    name: "Lane border",
    color: new THREE.Color(theme.accent),
    emissive: new THREE.Color("#9f1239"),
    emissiveIntensity: 0.18,
    roughness: 0.5,
  });

  const centerDashMat = new THREE.MeshStandardMaterial({
    name: "Center guide",
    color: new THREE.Color("#94a3b8"),
    roughness: 0.6,
    metalness: 0.1,
  });

  const rampMat = new THREE.MeshStandardMaterial({
    name: "Ramp surface",
    color: new THREE.Color("#616e82"),
    roughness: 0.72,
    metalness: 0.12,
  });

  const rampStripeMat = new THREE.MeshStandardMaterial({
    name: "Ramp edge highlight",
    color: new THREE.Color(theme.accent),
    emissive: new THREE.Color("#9f1239"),
    emissiveIntensity: 0.18,
    roughness: 0.5,
  });

  const coinMat = new THREE.MeshStandardMaterial({
    name: "Arcade coin",
    color: new THREE.Color("#eab308"),
    emissive: new THREE.Color("#a16207"),
    emissiveIntensity: 0.18,
    metalness: 0.35,
    roughness: 0.4,
  });

  const materials: THREE.Material[] = [
    groundMat,
    roadMat,
    laneLineMat,
    centerDashMat,
    rampMat,
    rampStripeMat,
    coinMat,
  ];

  const propModels: DetailedVehicleModel[] = [];

  // Tüm oyun modlarında kesintisiz tam yol çizgileri (yarım kalma sorununu önler)
  const fullTrackGroup = new THREE.Group();
  fullTrackGroup.name = "full-continuous-track";
  root.add(fullTrackGroup);

  const trackCenterX = 1200;

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(trackLength, 2400),
    groundMat
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.set(trackCenterX, -0.34, 0);
  fullTrackGroup.add(groundPlane);

  const road = new THREE.Group();
  const roadDeck = new THREE.InstancedMesh(new THREE.PlaneGeometry(roadTileLength, 13.6), roadMat, 29);
  const shoulder = new THREE.InstancedMesh(new THREE.PlaneGeometry(roadTileLength, 27), groundMat, 29);
  const roadTransform = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  for (let i = 0; i < roadDeck.count; i++) {
    const x = (i - 10) * roadTileLength;
    roadDeck.setMatrixAt(i, roadTransform.setPosition(x, 0, 0));
    shoulder.setMatrixAt(i, roadTransform.setPosition(x, -0.078, 0));
  }
  road.add(shoulder, roadDeck);
  root.add(road);

  const leftLaneLine = new THREE.Mesh(
    new THREE.BoxGeometry(trackLength, 0.012, 0.22),
    laneLineMat
  );
  leftLaneLine.position.set(trackCenterX, 0.012, -6.2);
  fullTrackGroup.add(leftLaneLine);

  const rightLaneLine = new THREE.Mesh(
    new THREE.BoxGeometry(trackLength, 0.012, 0.22),
    laneLineMat
  );
  rightLaneLine.position.set(trackCenterX, 0.012, 6.2);
  fullTrackGroup.add(rightLaneLine);

  const markerSpacing = 9;
  const markerCount = 92;
  const markerStart = -markerSpacing * 20;
  const markerGeometry = new THREE.BoxGeometry(2.8, 0.018, 0.12);
  const markers = new THREE.InstancedMesh(markerGeometry, centerDashMat, markerCount * 2);
  const markerMatrix = new THREE.Matrix4();
  for (let i = 0; i < markerCount; i++) {
    for (const side of [-1, 1]) {
      markerMatrix.makeTranslation(markerStart + i * markerSpacing, 0.016, side * 2.2);
      markers.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), markerMatrix);
    }
  }
  root.add(markers);

  const lampSpacing = 30;
  const lampCount = 32;
  const lampOffset = isBackflip ? clearDistance + 1 : 7.25;
  const lamps = new THREE.Group();
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(themeId === "night" ? "#a9bbca" : "#848f99") });
  materials.push(lampMat);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 5.4, 0.13), roadMat, lampCount * 2);
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.09, 0.6), lampMat, lampCount * 2);
  for (let i = 0; i < lampCount * 2; i++) {
    const x = (Math.floor(i / 2) - 9) * lampSpacing;
    const side = i % 2 === 0 ? -1 : 1;
    posts.setMatrixAt(i, markerMatrix.makeTranslation(x, 2.7, side * lampOffset));
    bulbs.setMatrixAt(i, markerMatrix.makeTranslation(x, 5.4, side * (lampOffset - 0.20)));
  }
  lamps.add(posts, bulbs);
  root.add(lamps);

  const skylineMaterial = new THREE.MeshStandardMaterial({
    color: themeId === "highland" ? "#536459" : themeId === "coast" ? "#758a86" : themeId === "day" ? "#63778b" : "#263551",
    roughness: 0.96,
  });
  materials.push(skylineMaterial);
  const skyline = new THREE.InstancedMesh(city ? new THREE.BoxGeometry(1, 1, 1) : new THREE.ConeGeometry(1, 1, themeId === "coast" ? 6 : 8), skylineMaterial, 76);
  const tower = new THREE.Object3D();
  for (let i = 0; i < skyline.count; i++) {
    const height = 8 + (i * 37 % 39);
    tower.position.set((i % 38 - 9) * 34, height / 2 - 0.05, skylineDepth(i));
    tower.scale.set(city ? 10 + i * 11 % 16 : 24 + i * 11 % 18,
      city ? height : height * (themeId === "highland" ? 2.3 : 0.75),
      city ? 8 + i * 7 % 14 : 22 + i * 9 % 24);
    if (!city) tower.position.y = tower.scale.y / 2 - 0.1;
    tower.updateMatrix();
    skyline.setMatrixAt(i, tower.matrix);
  }
  if (city) root.add(skyline);
  else { skyline.geometry.dispose(); skyline.dispose(); }
  const panorama = buildPanorama(themeId, clearDistance);
  root.add(panorama);
  const windowMat = new THREE.MeshBasicMaterial({
    color: isArcade ? "#577eb4" : "#927899",
    fog: true,
  });
  materials.push(windowMat);
  const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), windowMat, skyline.count * 18);
  let windowCount = 0;
  for (let i = 0; i < skyline.count; i++) {
    const x = (i % 38 - 9) * 34;
    const z = skylineDepth(i);
    const height = 8 + (i * 37 % 39);
    const facadeZ = z - Math.sign(z) * ((8 + i * 7 % 14) / 2 + 0.03);
    tower.rotation.y = z > 0 ? Math.PI : 0;
    tower.scale.set(1.1, 0.65, 1);
    for (let floor = 1; floor <= 6 && floor * 4.5 < height - 1; floor++) {
      for (let column = -1; column <= 1; column++) {
        if ((i * 13 + floor * 7 + column * 11) % 5 > 2) continue;
        tower.position.set(x + column * 3, floor * 4.5, facadeZ);
        tower.updateMatrix();
        windows.setMatrixAt(windowCount++, tower.matrix);
      }
    }
  }
  windows.count = windowCount;
  if (city) {
    windows.visible = themeId === "night";
    root.add(windows);
  } else {
    windows.dispose();
    windows.geometry.dispose();
  }

  const landscape = new THREE.Group();
  if (!city) {
    const foliage = new THREE.MeshStandardMaterial({ color: themeId === "coast" ? "#536e57" : "#435946", roughness: 1 });
    const wood = new THREE.MeshStandardMaterial({ color: "#61584c", roughness: 1 });
    materials.push(foliage, wood);
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2, 7), foliage, 82);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 3.2, 6), wood, trees.count);
    const tree = new THREE.Object3D();
    for (let i = 0; i < trees.count; i++) {
      const x = (i % 41 - 10) * 21;
      const z = (i < 41 ? -1 : 1) * (Math.max(20, clearDistance + 3) + (i * 17 % 39));
      tree.position.set(x, 1.5, z);
      tree.scale.set(1, 1, 1);
      tree.updateMatrix();
      trunks.setMatrixAt(i, tree.matrix);
      tree.position.y = themeId === "coast" ? 3.6 : 4.8;
      tree.scale.set(themeId === "coast" ? 2.8 : 1.7, themeId === "coast" ? 0.64 : 2.6, 1.8);
      tree.updateMatrix();
      trees.setMatrixAt(i, tree.matrix);
    }
    landscape.add(trunks, trees);
    root.add(landscape);
  }

  if (isBackflip) {
    const curlVisual = buildCurlRampVisual(rampMat, rampStripeMat);
    root.add(curlVisual);
  }

  if (isKickflip) {
    root.add(buildLineup(level.obstacles, quality));
  }

  const spectators = buildSpectators(isArcade, isBackflip);
  root.add(spectators.root);
  const pickups: ArcadePickup[] = [];
  const obstacles: ArcadeObstacle[] = [];
  let nextSpawnX = 19;
  let entityId = 1;
  const coinGeo = new THREE.OctahedronGeometry(0.62, 0);
  const pruneDistance = 220;

  const spawnArcadeChunk = (startX: number, distanceFactor: number): void => {
    const density = clamp(distanceFactor, 1, 2.5);
    const seed = entityId * 37 + Math.round(startX);

    // Önceki ve son rampa yüksekliğinin tam ortasında dengeli rampa boyları
    const heightVariants = [1.55, 2.0, 2.45, 1.8, 2.75];
    const lengthVariants = [11.5, 13.5, 15.0, 12.5, 16.0];
    const laneVariants = [-2.0, 0, 2.0, -1.1, 1.3];

    const rHeight =
      heightVariants[Math.abs(seed) % heightVariants.length] +
      Math.min(0.35, (density - 1) * 0.2);
    const rLen = lengthVariants[Math.abs(seed * 3) % lengthVariants.length];
    const rDepth = 5.5 + (Math.abs(seed) % 3) * 0.5;
    const rx = startX + 16 + (Math.abs(seed * 5) % 10);
    const rz = laneVariants[Math.abs(seed * 7) % laneVariants.length];

    const profile = new THREE.Shape();
    profile.moveTo(-rLen / 2, 0);
    profile.lineTo(rLen / 2, 0);
    profile.lineTo(rLen / 2, rHeight);
    profile.closePath();
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: rDepth, bevelEnabled: false });
    geometry.translate(0, 0, -rDepth / 2);
    const rampMesh = new THREE.Mesh(geometry, rampMat);
    rampMesh.position.set(rx, 0, rz);
    root.add(rampMesh);

    obstacles.push({
      id: entityId++,
      x: rx,
      y: rHeight * 0.5,
      z: rz,
      width: rLen,
      height: rHeight,
      depth: rDepth,
      kind: "ramp",
      mesh: rampMesh,
    });

    const coinCount = 2 + (Math.abs(seed) % 2);
    for (let c = 0; c < coinCount; c++) {
      const cx = rx + rLen * 0.5 + 4.5 + c * 4.8;
      const cy = rHeight * 1.3 + 1.25 + c * 0.6;
      const cz = rz;
      const coinMesh = new THREE.Mesh(coinGeo, coinMat);
      coinMesh.position.set(cx, cy, cz);
      root.add(coinMesh);
      pickups.push({
        id: entityId++,
        x: cx,
        y: cy,
        z: cz,
        value: 35 + c * 10,
        collected: false,
        mesh: coinMesh,
      });
    }

    const trafficColors = ["#52788c", "#ae9b67", "#617e72", "#bb896a", "#9b6470", "#806e93", "#b9bec5"];
    const trafficOffsets = [-2.8, -1.4, 0, 1.4, 2.8];

    const countInChunk = density > 1.4 ? 2 : 1;
    for (let t = 0; t < countInChunk; t++) {
      const tx = startX + 65 + t * 19 + ((seed + t * 13) % 9);
      const tz =
        trafficOffsets[Math.abs(seed * (t + 2) + t * 5) % trafficOffsets.length];
      const tColor =
        trafficColors[Math.abs(seed * 2 + t * 7) % trafficColors.length];
      const trafficModel = new DetailedVehicleModel("bmw_7_series", quality, tColor);

      const yawJitter = (seed + t) % 5 === 0 ? 0.08 : 0;
      trafficModel.root.rotation.y = yawJitter;
      trafficModel.root.position.set(tx, 0, tz);
      root.add(trafficModel.root);
      propModels.push(trafficModel);

      obstacles.push({
        id: entityId++,
        x: tx,
        y: 0.75,
        z: tz,
        width: 4.3,
        height: 1.5,
        depth: 2.1,
        kind: "traffic",
        mesh: trafficModel.root,
        vehicleModel: trafficModel,
      });
    }
  };

  const resetArcade = (): void => {
    for (const p of pickups) root.remove(p.mesh);
    for (const o of obstacles) {
      root.remove(o.mesh);
      if (!o.vehicleModel && o.mesh instanceof THREE.Mesh) o.mesh.geometry.dispose();
      if (o.vehicleModel) {
        o.vehicleModel.dispose();
        const index = propModels.indexOf(o.vehicleModel);
        if (index >= 0) propModels.splice(index, 1);
      }
    }
    pickups.length = 0;
    obstacles.length = 0;
    entityId = 1;
    nextSpawnX = 19;
    if (isArcade) {
      for (let i = 0; i < 3; i++) {
        spawnArcadeChunk(nextSpawnX, 1 + i * 0.25);
        nextSpawnX += 116;
      }
    }
  };

  return {
    root,
    fog,
    resetArcade,
    cheer: spectators.cheer,
    dispose(): void {
      for (const m of propModels) {
        m.dispose();
      }
      propModels.length = 0;
      // propModels already owns all traffic vehicles; never dispose twice.
      const geometries = new Set<THREE.BufferGeometry>();
      const sceneMaterials = new Set(materials);
      root.traverse((obj) => {
        if (obj instanceof THREE.InstancedMesh) obj.dispose();
        if (obj instanceof THREE.Mesh && obj.geometry) {
          geometries.add(obj.geometry);
          const slots = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const material of slots) sceneMaterials.add(material);
        }
      });
      for (const geo of geometries) {
        geo.dispose();
      }
      coinGeo.dispose();
      asphalt.dispose();
      for (const mat of sceneMaterials) {
        mat.dispose();
      }
      root.removeFromParent();
    },
    consumeArcadePickups(carPos): number {
      if (!isArcade) return 0;
      let earned = 0;
      for (const p of pickups) {
        if (p.collected) continue;
        const dx = p.x - carPos.x;
        const dy = p.y - (carPos.y + 0.8);
        const dz = p.z - carPos.z;
        if (dx * dx + dy * dy + dz * dz <= 7.2) {
          p.collected = true;
          p.mesh.visible = false;
          earned += p.value;
        }
      }
      return earned;
    },
    checkArcadeTrafficJumpOrHit(carPos) {
      if (!isArcade) return "none";
      for (const o of obstacles) {
        if (o.kind !== "traffic") continue;
        const dx = carPos.x - o.x;
        const dz = Math.abs(o.z - carPos.z);
        if (Math.abs(dx) >= 3.4 || dz >= 1.85) continue;
        if (carPos.y < o.height) return "crash";
        if (dx >= 2 && !o.cleared) {
          o.cleared = true;
          return "jumped";
        }
      }
      return "none";
    },
    sampleArcadeRamp(carPos) {
      if (!isArcade) {
        return { onRamp: false, groundY: 0, slopeAngle: 0, boostFactor: 1 };
      }
      for (const o of obstacles) {
        if (o.kind !== "ramp") continue;
        const halfLen = o.width * 0.5;
        const halfDepth = o.depth * 0.5;
        if (
          carPos.x >= o.x - halfLen &&
          carPos.x <= o.x + halfLen &&
          Math.abs(carPos.z - o.z) <= halfDepth
        ) {
          const t = clamp((carPos.x - (o.x - halfLen)) / o.width, 0, 1);
          const rampY = t * o.height;
          const slopeAngle = Math.atan2(o.height, o.width);
          const boostFactor = clamp(o.height / 1.85, 1.0, 1.45);
          return { onRamp: true, groundY: rampY, slopeAngle, boostFactor };
        }
      }
      return { onRamp: false, groundY: 0, slopeAngle: 0, boostFactor: 1 };
    },
    update(dt, time, carPos) {
      if (isArcade) {
        fullTrackGroup.position.x = Math.floor(carPos.x / 1000) * 1000;
        road.position.x = Math.floor(carPos.x / (8 * roadTileLength)) * 8 * roadTileLength;
        lamps.position.x = Math.floor(carPos.x / 300) * 300;
        markers.position.x = Math.floor(carPos.x / (markerSpacing * 35)) * markerSpacing * 35;
        skyline.position.x = Math.floor(carPos.x / 680) * 680;
        windows.position.x = skyline.position.x;
        landscape.position.x = Math.floor(carPos.x / 420) * 420;
        panorama.position.x = Math.floor(carPos.x / 540) * 540;
        while (carPos.x + 260 > nextSpawnX) {
          const factor = 1 + Math.max(0, carPos.x) / 240;
          spawnArcadeChunk(nextSpawnX, factor);
          nextSpawnX += lerp(118, 92, clamp(factor / 3, 0, 1));
        }
        // Discard entities well behind the player to keep draw calls and memory bounded.
        for (let i = pickups.length - 1; i >= 0; i--) {
          if (pickups[i].x >= carPos.x - pruneDistance) continue;
          root.remove(pickups[i].mesh);
          pickups.splice(i, 1);
        }
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const obstacle = obstacles[i];
          if (obstacle.x + obstacle.width * 0.5 >= carPos.x - pruneDistance) continue;
          root.remove(obstacle.mesh);
          if (obstacle.vehicleModel) {
            obstacle.vehicleModel.dispose();
            const modelIndex = propModels.indexOf(obstacle.vehicleModel);
            if (modelIndex >= 0) propModels.splice(modelIndex, 1);
          } else if (obstacle.mesh instanceof THREE.Mesh) {
            obstacle.mesh.geometry.dispose();
          }
          obstacles.splice(i, 1);
        }
        for (const p of pickups) {
          if (p.collected) continue;
          p.mesh.rotation.y = time * 3.0 + p.id;
          p.mesh.position.y = p.y + Math.sin(time * 3.6 + p.id) * 0.14;
        }
      }
      spectators.update(dt, time, carPos.x);
    },
  };
}
