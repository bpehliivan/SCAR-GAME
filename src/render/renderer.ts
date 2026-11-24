import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { THEMES, type ThemeId } from "@/core/driver-profile";
import type { Quality } from "@/core/types";

/** `?quality=low|high` overrides; otherwise phones/tablets get "low". */
export function detectQuality(): Quality {
  const forced = new URLSearchParams(location.search).get("quality");
  if (forced === "low" || forced === "high") return forced;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) < 900;
  return coarse && small ? "low" : "high";
}

/**
 * WebGL renderer + post-processing shared by the game and the dev preview pages,
 * so every module is judged under the same tone mapping, bloom and reflections.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.25, 3000);
  readonly quality: Quality;
  private readonly composer: EffectComposer;
  private skyLevel: ThemeId | null = null;
  private readonly sky = new THREE.Mesh(
    new THREE.SphereGeometry(1700, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color() },
        middle: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec3 direction;
        void main() {
          direction = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }
      `,
      fragmentShader: `
        varying vec3 direction;
        uniform vec3 zenith;
        uniform vec3 middle;
        uniform vec3 horizon;
        uniform float time;
        void main() {
          vec3 ray = normalize(direction);
          float band = .40 + .08 * sin(ray.z * 3. + time * .17);
          vec3 color = mix(horizon, middle, smoothstep(-.10, band, ray.y));
          color = mix(color, zenith, smoothstep(.22, .94, ray.y));
          float glow = pow(max(0., dot(ray, normalize(vec3(.94, .12, -.22)))), 12.);
          float lowCloud = sin(ray.x * 7.5 + ray.z * 11.0 + time * 0.012)
                         + 0.42 * sin(ray.x * 20.3 - ray.z * 28.7);
          float haze = smoothstep(0.4, 1.22, lowCloud);
          haze *= smoothstep(0.08, 0.17, ray.y) * (1.0 - smoothstep(.18,.38,ray.y));
          color = mix(color, horizon * 1.07, haze * 0.34);
          gl_FragColor = vec4(color + horizon * glow * .28, 1.);
        }
      `,
    })
  );
  /** PMREM render target holding scene.environment. */
  private readonly envTarget: THREE.WebGLRenderTarget;

  constructor(canvas: HTMLCanvasElement, quality: Quality = detectQuality()) {
    this.quality = quality;
    const high = quality === "high";
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.enabled = high;
    this.gl.shadowMap.type = THREE.PCFShadowMap;

    this.sky.renderOrder = -100;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.updateSky("night", 0);
    const pmrem = new THREE.PMREMGenerator(this.gl);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = high ? 0.75 : 0.48;
    room.dispose();
    pmrem.dispose();

    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: high ? 4 : 0,
    });
    this.composer = new EffectComposer(this.gl, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Strength, radius and threshold: bloom picks up linear luminance above
    // 1.06 in the HDR image, before OutputPass tone-maps it.
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.38, 1.06)
    );
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  /** Match the canvas' CSS size; call on window resize / orientation change. */
  resize(): void {
    const canvas = this.gl.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      this.quality === "high" ? 2 : 1.25
    );
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(width, height, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  updateSky(level: ThemeId, time: number): void {
    const { zenith, middle, horizon, time: clock } = this.sky.material.uniforms;
    if (this.skyLevel !== level) {
      const palette = THEMES[level].sky;
      zenith.value.set(palette[0]);
      middle.value.set(palette[1]);
      horizon.value.set(palette[2]);
      this.skyLevel = level;
    }
    clock.value = time;
  }

  render(): void {
    this.sky.position.copy(this.camera.position);
    this.composer.render();
  }

  /** Frees the GPU resources created here (not the scene's content). */
  dispose(): void {
    // EffectComposer.dispose() frees only its own buffers, not the passes'.
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.envTarget.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.gl.dispose();
  }
}
