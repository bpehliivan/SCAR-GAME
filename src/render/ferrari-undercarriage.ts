import * as THREE from "three";

export function finishFerrariUndercarriage(model: THREE.Group): void {
  const body = model.getObjectByName("wheel-1")?.parent;
  if (!body) return;

  // The source wheel assemblies also contain stationary brake and arch pieces.
  const wheels = body.children.filter((part) => part.name.startsWith("wheel-"));
  for (const wheel of wheels) {
    for (const part of [...wheel.children]) {
      if (!(part instanceof THREE.Mesh) || Array.isArray(part.material)) continue;
      if (part.material.name === "Trim" || part.material.name === "Body paint") body.attach(part);
    }
  }

  // The front axles in the source file are slightly staggered.
  const front = wheels.filter((wheel) => wheel.position.x > 0);
  if (front.length === 2) {
    const axleX = (front[0].position.x + front[1].position.x) / 2;
    const axleY = (front[0].position.y + front[1].position.y) / 2;
    const halfTrack = (Math.abs(front[0].position.z) + Math.abs(front[1].position.z)) / 2;
    for (const wheel of front) {
      const side = Math.sign(wheel.position.z);
      const rear = wheels.find((candidate) =>
        candidate.position.x < 0 && Math.sign(candidate.position.z) === side
      );
      wheel.position.set(axleX, axleY, side * halfTrack);
      if (!rear) continue;

      // The source front wheels are already steered inside their mesh. A
      // straight wheel from the same model has a coaxial tire and rim.
      wheel.clear();
      for (const part of rear.children) {
        if (!(part instanceof THREE.Mesh)) continue;
        const straightPart = part.clone();
        straightPart.scale.set(0.96, 0.96, 0.93);
        wheel.add(straightPart);
      }
    }
  }

  // Taper the sealed floor around the wheel wells and into the bumpers.
  const outline = new THREE.Shape();
  const stations = [
    [-2.19, 0.64], [-1.82, 0.79], [-1.53, 0.66], [-1.02, 0.66],
    [-0.62, 0.87], [0.82, 0.84], [1.10, 0.63], [1.82, 0.63],
    [2.20, 0.67],
  ];
  outline.moveTo(stations[0][0], stations[0][1]);
  for (const [x, halfWidth] of stations.slice(1)) outline.lineTo(x, halfWidth);
  for (const [x, halfWidth] of [...stations].reverse()) outline.lineTo(x, -halfWidth);
  outline.closePath();
  const floor = new THREE.ExtrudeGeometry(outline, {
    depth: 0.075,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.014,
    bevelSegments: 1,
  });
  floor.rotateX(-Math.PI / 2);
  const undertray = new THREE.Mesh(floor, new THREE.MeshStandardMaterial({
    color: "#24272b",
    roughness: 0.9,
    metalness: 0.10,
  }));
  undertray.name = "Ferrari undertray";
  undertray.position.y = 0.136;
  body.add(undertray);
}
