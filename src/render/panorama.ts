
import * as THREE from "three";
import type { ThemeId } from "@/core/driver-profile";

function ridge(
  side: number,
  from: number,
  width: number,
  scale: number,
  phase: number,
  material: THREE.MeshStandardMaterial
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(1700, width, 124, 16);
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.attributes.position;
  const color = new THREE.Color();
  const colors = new Float32Array(vertices.count * 3);
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i) + 275;
    const t = vertices.getZ(i) / width + 0.5;
    const envelope = Math.sin(Math.PI * Math.pow(t, 0.86)) ** 1.18;
    const height = Math.max(0, scale * envelope * (
      0.44 + Math.sin(x * 0.008 + phase) * 0.22 +
      Math.sin(x * 0.021 - t * 2.2 + phase) * 0.16 +
      Math.sin(x * 0.051 + t * 4.7) * 0.075
    ));
    const ripple = Math.sin(x * 0.046 + t * 39) * Math.sin(x * 0.029 - t * 14);
    vertices.setXYZ(i, x, height - 0.22, side * (from + width * t));
    color.setScalar(Math.max(0.44, 0.91 - height / (scale * 3) + ripple * 0.15));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  // The negative-Z shoreline reverses the plane's winding.
  material.side = THREE.DoubleSide;
  return new THREE.Mesh(geometry, material);
}

export function buildPanorama(theme: ThemeId, clearDistance = 0): THREE.Group {
  const root = new THREE.Group();
  root.name = "three-dimensional panorama";
  const coast = theme === "coast";
  const alpine = theme === "highland";
  const night = theme === "night";
  const stone = new THREE.MeshStandardMaterial({
    color: coast ? "#637064" : alpine ? "#647269" : night ? "#375475" : "#768e9f",
    roughness: 0.95,
    vertexColors: true,
  });
  const distant = new THREE.MeshStandardMaterial({
    color: coast ? "#a49491" : alpine ? "#879aab" : night ? "#4e6381" : "#93a5b1",
    roughness: 1,
    vertexColors: true,
  });
  root.add(ridge(1, Math.max(clearDistance, coast ? 39 : alpine ? 33 : 178), 240, alpine ? 219 : coast ? 118 : 143, 0.5, stone));
  root.add(ridge(-1, Math.max(clearDistance, coast ? 285 : alpine ? 31 : 194), 250, alpine ? 214 : 135, 3.2, stone));
  root.add(ridge(1, 305, 340, 222, 2.65, distant), ridge(-1, 455, 300, 190, 1.2, distant));

  if (coast) {
    const water = new THREE.MeshStandardMaterial({
      color: "#315f70", roughness: 0.66, metalness: 0.19, vertexColors: true,
    });
    const surface = new THREE.PlaneGeometry(1750, 320, 124, 34);
    surface.rotateX(-Math.PI / 2);
    const points = surface.attributes.position;
    const colors = new Float32Array(points.count * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), z = points.getZ(i);
      const wave = Math.sin(x * 0.039 + z * 0.54) * Math.sin(z * 0.14 - x * 0.017);
      points.setY(i, 0.1 + wave * 0.071);
      tint.setScalar(0.83 + wave * 0.09);
      tint.toArray(colors, i * 3);
    }
    surface.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    surface.computeVertexNormals();
    const sea = new THREE.Mesh(surface, water);
    sea.position.set(300, -0.23, -181);
    root.add(sea);

    const roof = new THREE.MeshStandardMaterial({ color: "#92786d", roughness: 0.92 });
    const plaster = new THREE.MeshStandardMaterial({ color: "#d2ba9e", roughness: 0.95 });
    const cottages = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), plaster, 24);
    const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.78, 0.36, 4), roof, 24);
    const site = new THREE.Object3D();
    for (let i = 0; i < cottages.count; i++) {
      const x = -175 + i * 29 + Math.sin(i * 2) * 8;
      const z = Math.max(clearDistance + 11, 21) + (i * 7 % 16);
      const wallHeight = 2.8 + i % 3;
      site.position.set(x, wallHeight / 2 - 0.04, z);
      site.scale.set(6 + i % 4, wallHeight, 5.2 + i % 3);
      site.rotation.y = 0.03 * (i % 5);
      site.updateMatrix();
      cottages.setMatrixAt(i, site.matrix);
      site.position.y = wallHeight + 0.63;
      site.scale.set(6.8 + i % 4, 3.6, 6 + i % 3);
      site.rotation.y += Math.PI / 4;
      site.updateMatrix();
      roofs.setMatrixAt(i, site.matrix);
    }
    root.add(cottages, roofs);
  }
  return root;
}

