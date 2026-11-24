
import * as THREE from "three";

const CELL_LENGTH = 32;
const PEOPLE_MAX = 9;
const ROAD_EDGE = 7.85;
const SHIRTS = ["#b68b51", "#3a7cb9", "#af4b5d", "#4a8c79", "#aeb8c2", "#806796"];
const SKINS = ["#c89775", "#a46e50", "#77513f", "#bd987b"];
const FLAGS = ["#d35b46", "#3c82b7", "#d0ac57", "#7869a5"];

interface Person {
  x: number;
  z: number;
  size: number;
  phase: number;
  energy: number;
  shirt: string;
  skin: string;
  flag?: string;
}

function random(cell: number, index: number): number {
  let value = Math.imul(cell + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function buildSpectators(arcade: boolean, keepCameraSideClear = false) {
  const root = new THREE.Group();
  const cellCount = arcade ? 10 : 6;
  const capacity = cellCount * PEOPLE_MAX * 2;
  const railMat = new THREE.MeshStandardMaterial({ color: "#5e7893", roughness: 0.92 });
  const crowdMat = new THREE.MeshLambertMaterial({ color: "#aaaaaa" });
  const flagMat = new THREE.MeshLambertMaterial({ color: "#aaaaaa", side: THREE.DoubleSide });
  const crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), crowdMat, capacity * 6);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_LENGTH, 0.08, 0.1), railMat, cellCount * 4);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.98, 0.07), railMat, cellCount * 16);
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.026, 1, 0.026), railMat, capacity);
  const flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.57, 0.34), flagMat, capacity);
  for (const mesh of [crowd, rails, posts, poles, flags]) mesh.frustumCulled = false;
  root.add(crowd, rails, posts, poles, flags);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const people: Person[] = [];
  let lastCell = Infinity;
  let previousUpdate = -1;
  let cheerX = 0;
  let cheerTime = 0;

  function place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number,
    sx = 1, sy = 1, sz = 1, rz = 0, ry = 0): void {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, ry, rz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function layout(first: number): void {
    people.length = 0;
    let rail = 0;
    let post = 0;
    for (let cell = first; cell < first + cellCount; cell++) {
      const start = cell * CELL_LENGTH;
      for (const side of keepCameraSideClear ? [-1] : [-1, 1]) {
        const group = cell * 2 + (side > 0 ? 1 : 0);
        for (const y of [0.53, 0.92]) place(rails, rail++, start + CELL_LENGTH / 2, y, side * ROAD_EDGE);
        for (let i = 0; i < 8; i++) place(posts, post++, start + i * 4, 0.46, side * ROAD_EDGE);

        const count = 3 + Math.floor(random(group, 1) * (PEOPLE_MAX - 2));
        const spacing = 1.4 + random(group, 2) * 1.1;
        const startGroup = start + 2 + random(group, 3) * (CELL_LENGTH - 4 - spacing * (count - 1));
        for (let i = 0; i < count; i++) {
          const variant = i * 9 + 8;
          people.push({
            x: startGroup + i * spacing + (random(group, variant) - 0.5) * 0.72,
            z: side * (8.48 + random(group, variant + 1) * 0.48),
            size: 0.85 + random(group, variant + 2) * 0.23,
            phase: random(group, variant + 3) * Math.PI * 2,
            energy: random(group, variant + 4),
            shirt: SHIRTS[Math.floor(random(group, variant + 5) * SHIRTS.length)],
            skin: SKINS[Math.floor(random(group, variant + 6) * SKINS.length)],
            flag: random(group, variant + 7) < 0.18 ? FLAGS[Math.floor(random(group, variant + 8) * FLAGS.length)] : undefined,
          });
        }
      }
    }
    rails.count = rail;
    posts.count = post;
    crowd.count = people.length * 6;
    people.forEach((person, i) => {
      [person.skin, person.shirt, "#333d52", "#333d52", person.shirt, person.shirt].forEach((tone, part) => {
        crowd.setColorAt(i * 6 + part, color.set(tone));
      });
    });
    crowd.instanceColor!.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
  }

  function update(dt: number, time: number, x: number): void {
    cheerTime = Math.max(0, cheerTime - dt);
    const first = arcade ? Math.floor(x / CELL_LENGTH) - 3 : -5;
    if (first !== lastCell) {
      lastCell = first;
      layout(first);
    } else if (time - previousUpdate < 1 / 24) {
      return;
    }
    previousUpdate = time;
    let flagCount = 0;
    const driverX = x;
    people.forEach((person, i) => {
      const { x, z, size, phase, energy } = person;
      const cheering = cheerTime > 0 && Math.abs(x - cheerX) < 34;
      const bob = Math.sin(time * 3.5 + phase) * (cheering ? 0.065 : 0.023);
      const wave = Math.sin(time * (3.6 + energy * 4) + phase);
      const passingWave = Math.abs(x - driverX) < 13 && energy > 0.72;
      const raised = cheering || passingWave;
      const left = raised && energy < 0.71 ? 2.24 + wave * 0.29 : 0.14 + wave * 0.11;
      const right = person.flag ? 2.38 + wave * 0.22
        : raised && energy > 0.29 ? 2.21 - wave * 0.32 : 0.14 - wave * 0.11;
      const y = -0.075;
      const at = i * 6;
      place(crowd, at, x, y + 1.48 * size + bob, z, 0.123 * size, 0.148 * size, 0.12 * size);
      place(crowd, at + 1, x, y + 1.09 * size + bob, z, 0.21 * size, 0.28 * size, 0.14 * size);
      place(crowd, at + 2, x - 0.10 * size, y + 0.38 * size, z, 0.08 * size, 0.38 * size, 0.087 * size);
      place(crowd, at + 3, x + 0.10 * size, y + 0.38 * size, z, 0.08 * size, 0.38 * size, 0.087 * size);
      const shoulder = y + 1.24 * size + bob;
      const arm = 0.25 * size;
      const leftX = x - (0.19 * size + Math.sin(left) * arm);
      const rightX = x + (0.19 * size + Math.sin(right) * arm);
      place(crowd, at + 4, leftX, shoulder - Math.cos(left) * arm, z, 0.067 * size, arm, 0.073 * size, -left);
      place(crowd, at + 5, rightX, shoulder - Math.cos(right) * arm, z, 0.067 * size, arm, 0.073 * size, right);
      if (!person.flag) return;
      const flagHeight = shoulder - 2 * Math.cos(right) * arm + 0.20;
      const flagX = rightX + Math.sin(right) * arm;
      const angle = Math.sin(time * 4 + phase) * 0.23;
      place(poles, flagCount, flagX, flagHeight, z, 1, 0.93, 1, angle);
      place(flags, flagCount, flagX + 0.25 - angle * 0.4, flagHeight + 0.29, z, 1, 1, 1, angle, Math.sin(time * 4.8 + phase) * 0.38);
      flags.setColorAt(flagCount++, color.set(person.flag));
    });
    poles.count = flags.count = flagCount;
    crowd.instanceMatrix.needsUpdate = poles.instanceMatrix.needsUpdate = flags.instanceMatrix.needsUpdate = true;
    if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  }

  update(0, 0, 0);
  return {
    root,
    update,
    cheer(x: number): void {
      cheerX = x;
      cheerTime = 2.1;
    },
  };
}

