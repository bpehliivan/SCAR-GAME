import type * as THREE from "three";
import { envScale } from "./env-scale";

// Keep reflected paint light below the bloom threshold without flattening
// shadows or changing the hue of bright paint.
export function softVehiclePaint<T extends THREE.MeshStandardMaterial>(material: T): T {
  return envScale(material, 0.55, 0.28, {
    specularCap: 0.9,
    direct: { scale: 0.65, cap: 0.34 },
    key: "soft-vehicle-paint",
    extend(shader) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        /* glsl */ `
          float paintPeak = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
          float whitePaint = smoothstep(0.52, 0.82, min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b));
          float knee = mix(0.48, 0.36, whitePaint);
          float shoulder = mix(0.19, 0.17, whitePaint);
          if (paintPeak > knee) {
            float softPeak = knee + shoulder * (1.0 - exp(-(paintPeak - knee) / shoulder));
            outgoingLight *= softPeak / paintPeak;
          }
          #include <opaque_fragment>
        `
      );
    },
  });
}
