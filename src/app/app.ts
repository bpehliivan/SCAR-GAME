import * as THREE from "three";
import { needsTutorial } from "@/core/save-transfer";
import { DEFAULT_PLATE, loadDriverProfile, saveDriverProfile, THEMES, type DriverProfile } from "@/core/driver-profile";
import { setPlayerPlate } from "@/render/vehicle-plate";
import { DriverSetup } from "@/ui/driver-setup";
import { AudioEngine } from "@/audio/audio-engine";
import { CAR } from "@/core/car-spec";
import { clamp, lerp } from "@/core/math";
import {
  loadBestScores,
  loadSettings,
  saveSettings,
  submitScore,
  type Settings,
} from "@/core/storage";
import type {
  ArcadeStunt,
  CarSnapshot,
  Controls,
  CrashReason,
  InputAction,
  LandingResult,
  LevelDef,
  LevelId,
  PhysicsEvent,
  Quality,
  ThrusterLevels,
} from "@/core/types";
import {
  getVehiclePreset,
  isArcadeLevelId,
  loadGarageState,
  saveGarageState,
  type GarageState,
  type VehicleId,
} from "@/core/garage";
import { Input } from "@/input/input";
import { getLevel, LEVEL_ORDER, nextLevel } from "@/levels";
import { createAutopilot } from "@/physics/autopilot";
import { CarPhysics } from "@/physics/car-physics";
import { ImportedVehicleModel } from "@/render/imported-vehicle";
import { CameraRig } from "@/render/camera-rig";
import { DetailedVehicleModel } from "@/render/detailed-vehicles";
import { FxSystem } from "@/render/fx";
import { Renderer } from "@/render/renderer";
import { VehicleShadow } from "@/render/vehicle-shadow";
import { buildScenery, type Scenery } from "@/render/scenery";
import { Hud } from "@/ui/hud";
import { AttractDemo } from "./attract-demo";
import { bindBrowserEvents } from "./browser-events";
import {
  installDebugHooks,
  mergePose,
  type DebugDriver,
  type GameStateInfo,
} from "./debug-hooks";
import { DebugOverlay } from "./debug-overlay";
import { presentEvent, type Presenters } from "./event-presenter";
import { readParams } from "./params";
import { CAMERA_MODE, inRun, stepsPhysics, type RunState } from "./run-state";

// ============================================================================
// [MANUEL AYAR ALANI - SONSUZ MOD FİZİK & BACKFLIP SABİTLERİ]
// Önceki ve son ayarın tam ortasında dengelenmiş başlangıç değerleri:
// ============================================================================
const ARCADE_TUNING = {
  // Rampa ucundan havalanırken verilen temel dikey sıçrama hızı (orta ayar)
  rampLaunchVy: 10.7,
  // Havadayken soğuk itici (thrust) basılı tutulduğunda yukarı ivme (orta ayar)
  airThrustAccelY: 10.2,
  // Yerçekimi ivmesi (orta ayar)
  gravity: 22.0,
} as const;

const MAX_DT = 1 / 20;
const DEBUG_DT = 1 / 60;
const RESULT_DELAY = 0.5;
const AUTOPILOT_START = 0.5;
const LANE_RAIL_LIMIT = 5.2;

type Driver = (car: CarSnapshot, dt: number) => Controls;

const NEUTRAL: Readonly<Controls> = Object.freeze({
  throttle: 0,
  brake: 0,
  thrust: false,
  spin: 0,
});

function buildArcadeLandingSummary(
  _level: LevelDef,
  runScore: number,
  airTime: number,
  maxHeight: number,
  distance: number,
  topSpeed: number,
  trickLabel: string,
  rollTurns: number,
  pitchTurns: number,
  gasLeft: number
): LandingResult {
  const safeScore = Math.max(0, Math.round(runScore));
  return {
    grade: safeScore >= 1200 ? "perfect" : safeScore >= 450 ? "great" : "good",
    goalMet: safeScore > 0,
    trick: {
      name: trickLabel,
      pitchTurns,
      rollTurns,
    },
    score: {
      trick: 0,
      air: 0,
      height: 0,
      gas: 0,
      multiplier: 1,
      total: safeScore,
    },
    stats: {
      airTime,
      maxHeight,
      distance,
      topSpeed,
      gasLeft,
    },
    impactSpeed: 0,
    angleError: 0,
  };
}

export class App {
  private readonly params = readParams();
  private readonly renderer: Renderer;
  private readonly hud: Hud;
  private readonly driverSetup: DriverSetup;
  private savedProfile = loadDriverProfile();
  private profile: DriverProfile = this.savedProfile ?? { plate: DEFAULT_PLATE, theme: "night" };
  private readonly input: Input;
  private readonly audio = new AudioEngine();
  private readonly cameraRig: CameraRig;
  private garage: GarageState = loadGarageState();
  private playerModel: DetailedVehicleModel | ImportedVehicleModel;
  private readonly fx: FxSystem;
  private readonly vehicleShadow = new VehicleShadow();
  private readonly presenters: Presenters;
  private readonly debugOverlay: DebugOverlay | null;
  private readonly sceneries = new Map<string, Scenery>();
  private readonly demo = new AttractDemo();

  private readonly scratchEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly scratchQuat = new THREE.Quaternion();

  private settings: Settings = loadSettings();
  private best = loadBestScores();
  private level: LevelDef;
  private physics: CarPhysics;
  private scenery: Scenery | null = null;
  private state: RunState = "menu";
  private paused = false;
  private autopilot: Driver | null = null;
  private lastPlayed: LevelId | null = null;

  private landing: LandingResult | null = null;
  private crash: { reason: CrashReason; obstacle?: string } | null = null;
  private newBest = false;
  private launched = false;
  private rollbackWarned = false;
  private resultDelay = -1;

  private arcadeRunScore = 0;
  private arcadeCredits = 0;
  private arcadeDistanceReward = 0;
  private arcadeAirTime = 0;
  private arcadeMaxHeight = 0;
  private arcadeTopSpeed = 0;
  private arcadeTotalTurns = 0;
  private arcadeLastTrick = "HAYATTA KALMA SERİSİ";

  // Sonsuz mod fizik ve yalnızca backflip (pitch) durumu
  private arcadeX = 0;
  private arcadeAirElapsed = 0;
  private arcadeGasRecovery = false;
  private arcadeY = 0;
  private arcadeZ = 0;
  private arcadeVx = 0;
  private arcadeVy = 0;
  private arcadeVz = 0;
  private arcadePitch = 0;
  private arcadeRequest: ArcadeStunt | undefined;
  private arcadeManeuver: { kind: ArcadeStunt; elapsed: number; duration: number } | null = null;
  private arcadePitchTurn = 0;
  private arcadeAirborne = false;
  private arcadeLastRampBoost = 1;
  private arcadeRoll = 0;
  private arcadeCompleted = 0;
  private arcadePitchTurns = 0;
  private arcadeWheelSpin = 0;
  private arcadeRailScrapeCooldown = 0;

  private time = 0;
  private stateTime = 0;
  private lastFrameTime = -1;
  private frames = 0;
  private needsRender = true;
  private manual = false;
  private poseOverride: CarSnapshot | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    const { scene, camera, quality } = this.renderer;
    this.hud = new Hud(uiRoot);
    setPlayerPlate(this.profile.plate);
    this.driverSetup = new DriverSetup(
      uiRoot, this.profile, (profile) => this.updateDriverProfile(profile), () => this.restoreProgress(),
    );
    this.hud.mountDriverMenu(this.driverSetup.button);
    this.input = new Input(uiRoot);
    this.cameraRig = new CameraRig(camera, this.input.isTouch);
    this.playerModel = this.buildSelectedVehicleModel(quality);
    scene.add(this.playerModel.root, this.vehicleShadow.mesh);
    this.fx = new FxSystem(scene, quality);
    this.presenters = {
      hud: this.hud,
      fx: this.fx,
      audio: this.audio,
      camera: this.cameraRig,
      onEarnCash: (amount) => this.earnCash(amount),
    };
    this.debugOverlay = this.params.debug ? new DebugOverlay() : null;
    if (this.debugOverlay) scene.add(this.debugOverlay.root);

    this.audio.setMuted(this.settings.muted);
    this.hud.setMuted(this.settings.muted);
    this.hud.setUnits("metric");
    this.level = getLevel(this.params.level ?? LEVEL_ORDER[0]);
    this.physics = new CarPhysics(this.level);
    installDebugHooks({
      play: (id) => this.startRun(id),
      advance: (seconds, driver) => this.advance(seconds, driver ?? null),
      state: () => this.stateInfo(),
      car: () => structuredClone(this.viewCar()),
      realtime: (on) => {
        this.manual = !on;
      },
      level: () => this.level,
      pose: (fields) => {
        this.poseOverride = fields ? mergePose(this.viewCar(), fields) : null;
      },
    });
  }

  private buildSelectedVehicleModel(quality: Quality): DetailedVehicleModel | ImportedVehicleModel {
    const id = this.garage.selectedId;
    const preset = getVehiclePreset(id);
    const color = this.garage.colors[id] ?? preset.defaultColor;
    return id === "tesla_roadster"
      ? new DetailedVehicleModel(id, quality, color, true)
      : new ImportedVehicleModel(id, quality, color);
  }

  public getGarageState(): GarageState {
    return this.garage;
  }

  public selectVehicle(id: VehicleId): void {
    const owned = new Set(this.garage.ownedIds);
    if (!owned.has(id)) return;
    this.garage = { ...this.garage, selectedId: id };
    saveGarageState(this.garage);
    this.rebuildVehicleMesh();
    this.hud.syncGarage(this.garage);
  }

  public buyVehicle(id: VehicleId): void {
    const preset = getVehiclePreset(id);
    const owned = new Set(this.garage.ownedIds);
    if (owned.has(id)) {
      this.selectVehicle(id);
      return;
    }
    if (this.garage.wallet < preset.price) {
      this.hud.popup("Yetersiz S Point", "warn");
      return;
    }
    owned.add(id);
    this.garage = {
      ...this.garage,
      wallet: this.garage.wallet - preset.price,
      ownedIds: Array.from(owned),
      selectedId: id,
    };
    saveGarageState(this.garage);
    this.rebuildVehicleMesh();
    this.hud.syncGarage(this.garage);
    this.hud.popup(`${preset.name} ALINDI`, "trick");
  }

  public selectVehicleColor(colorHex: string): void {
    const id = this.garage.selectedId;
    this.garage = {
      ...this.garage,
      colors: {
        ...this.garage.colors,
        [id]: colorHex,
      },
    };
    saveGarageState(this.garage);
    this.playerModel.setPaintColor(colorHex);
    this.hud.syncGarage(this.garage);
    this.needsRender = true;
  }

  public earnCash(amount: number): void {
    if (amount <= 0) return;
    const rounded = Math.round(amount);
    this.garage = {
      ...this.garage,
      wallet: this.garage.wallet + rounded,
    };
    saveGarageState(this.garage);
    this.hud.syncGarage(this.garage);

  }

  private rewardEndless(points: number, credits: number): void {
    this.arcadeRunScore += points;
    this.arcadeCredits += credits;
    this.earnCash(credits);
    this.hud.setEndlessScore(this.arcadeRunScore, this.arcadeCredits);
  }

  private updateDriverProfile(profile: DriverProfile): void {
    const themeChanged = profile.theme !== this.profile.theme;
    const plateChanged = profile.plate !== this.profile.plate;
    this.profile = profile;
    this.savedProfile = profile;
    saveDriverProfile(profile);
    if (plateChanged) {
      setPlayerPlate(profile.plate);
      this.rebuildVehicleMesh();
    }
    if (themeChanged && this.state === "menu") {
      const oldSceneries = [...this.sceneries.values()];
      this.sceneries.clear();
      this.loadLevel(this.level.id);
      for (const scenery of oldSceneries) scenery.dispose();
      this.cameraRig.snap(this.physics.car);
      this.present(0);
      this.needsRender = true;
    }
  }

  private restoreProgress(): void {
    this.savedProfile = loadDriverProfile();
    this.profile = this.savedProfile ?? { plate: DEFAULT_PLATE, theme: "night" };
    this.driverSetup.setProfile(this.profile);
    setPlayerPlate(this.profile.plate);
    this.garage = loadGarageState();
    this.best = loadBestScores();
    this.settings = loadSettings();
    this.audio.setMuted(this.settings.muted);
    this.hud.setMuted(this.settings.muted);
    this.rebuildVehicleMesh();
    const oldSceneries = [...this.sceneries.values()];
    this.sceneries.clear();
    this.enterMenu();
    for (const scenery of oldSceneries) scenery.dispose();
    this.showFirstRun();
  }

  private rebuildVehicleMesh(): void {
    const prev = this.playerModel;
    this.renderer.scene.remove(prev.root);
    prev.dispose();
    this.playerModel = this.buildSelectedVehicleModel(this.renderer.quality);
    this.renderer.scene.add(this.playerModel.root);
    this.present(0);
    this.needsRender = true;
  }

  start(): void {
    bindBrowserEvents({
      gesture: () => this.audio.unlock(),
      visibility: (hidden) => this.onVisibility(hidden),
      resize: () => {
        this.renderer.resize();
        this.needsRender = true;
      },
    });
    if (this.params.level) this.startRun(this.params.level);
    else {
      this.enterMenu();
      this.showFirstRun();
    }
    this.renderer.gl.setAnimationLoop(this.frame);
  }

  private showFirstRun(): void {
    if (needsTutorial()) this.driverSetup.openTutorial(!this.savedProfile);
    else if (!this.savedProfile) this.driverSetup.open(true);
  }

  private readonly frame = (now: number): void => {
    const dt =
      this.lastFrameTime < 0
        ? 0
        : clamp((now - this.lastFrameTime) / 1000, 0, MAX_DT);
    this.lastFrameTime = now;
    if (!this.manual) {
      this.input.update();
      for (const action of this.input.drainActions()) this.onAction(action);
      if (!this.paused) {
        this.tick(dt, null);
        this.needsRender = true;
      }
    }
    if (this.needsRender) {
      this.needsRender = false;
      this.renderer.render();
      if (++this.frames === 3) {
        window.__snapReady = true;
        this.prebuildSceneries();
      }
    }
  };

  private resetArcadePhysics(): void {
    this.arcadeX = 0;
    this.arcadeAirElapsed = 0;
    this.arcadeGasRecovery = false;
    this.arcadeY = 0;
    this.arcadeZ = 0;
    this.arcadeVx = 0;
    this.arcadeVy = 0;
    this.arcadeVz = 0;
    this.arcadePitch = 0;
    this.arcadeRequest = undefined;
    this.arcadeManeuver = null;
    this.arcadePitchTurn = 0;

    this.arcadeAirborne = false;
    this.arcadeLastRampBoost = 1;
    this.arcadeRoll = 0;
    this.arcadeCompleted = 0;
    this.arcadePitchTurns = 0;
    this.arcadeWheelSpin = 0;
    this.arcadeRailScrapeCooldown = 0;
    this.arcadeRunScore = 0;
    this.arcadeCredits = 0;
    this.arcadeDistanceReward = 0;
    this.arcadeAirTime = 0;
    this.arcadeMaxHeight = 0;
    this.arcadeTopSpeed = 0;
    this.arcadeTotalTurns = 0;
    this.arcadeLastTrick = "HAYATTA KALMA SERİSİ";
  }

  private triggerArcadeChallengeEnd(reason: CrashReason, obstacle?: string): void {
    if (this.state === "wrecked" || this.state === "landed") return;
    const finalPoints = Math.max(0, Math.round(this.arcadeRunScore));
    this.newBest = submitScore(this.level.id, finalPoints);
    this.best = loadBestScores();
    this.crash = { reason, obstacle };
    this.landing = buildArcadeLandingSummary(
      this.level,
      finalPoints,
      this.arcadeAirTime,
      this.arcadeMaxHeight,
      Math.max(0, this.arcadeX),
      this.arcadeTopSpeed,
      this.arcadeLastTrick,
      this.arcadeTotalTurns,
      this.arcadePitchTurns,
      this.physics.car.gas
    );
    const car = this.physics.car;
    car.mode = "crashed";
    car.throttle = 0;
    car.thrusters.fill(0);
    this.enterState("wrecked");
    this.audio.play("crash");
    this.hud.popup(`SONUÇ: ${finalPoints} PUAN`, "info");
    this.cameraRig.shake(0.75);
    this.resultDelay = RESULT_DELAY;
  }

  private stepArcadeSimulation(dt: number, controls: Controls): void {
    const car = this.physics.car;
    if (dt <= 0) return;

    this.arcadeRailScrapeCooldown = Math.max(0, this.arcadeRailScrapeCooldown - dt);

    const thrust = controls.thrust && !this.arcadeGasRecovery && car.gas > 0 && controls.brake < 0.05;
    if (thrust) {
      car.gas = Math.max(0, car.gas - dt / this.level.gasCapacity);
      if (car.gas === 0) {
        this.arcadeGasRecovery = true;
        this.hud.popup("SOĞUK GAZ TÜKENDİ", "warn");
      }
    } else if (!this.arcadeAirborne && !controls.thrust) {
      car.gas = Math.min(1, car.gas + dt * 0.24);
      if (car.gas >= 0.2) this.arcadeGasRecovery = false;
    }

    const vehicle = getVehiclePreset(this.garage.selectedId);
    const motor = 0.84 + vehicle.stats.speed * 0.0021;
    const difficulty = clamp(1 + this.arcadeX / 480, 1, 1.45);
    const maxForwardSpeed = (thrust ? 34 : 24) * difficulty * motor;
    if (controls.brake > 0.05) {
      this.arcadeVx -= 27 * controls.brake * dt;
    } else {
      const acceleration = 18 * motor * controls.throttle + (thrust ? 13 : 0);
      this.arcadeVx += (acceleration > 0 ? acceleration : -2.2) * dt;
    }
    if (this.arcadeVx > maxForwardSpeed) {
      this.arcadeVx = Math.max(maxForwardSpeed, this.arcadeVx - 24 * dt);
    }
    this.arcadeVx = Math.max(0, this.arcadeVx);

    const steerInput = clamp(controls.spin, -1, 1);
    const targetVz = steerInput * (this.arcadeAirborne ? 3.8 : 6.5) * (0.75 + vehicle.stats.control / 360);
    this.arcadeVz += (targetVz - this.arcadeVz) * Math.min(1, dt * 10);
    this.arcadeZ += this.arcadeVz * dt;

    if (this.arcadeZ > LANE_RAIL_LIMIT) {
      this.arcadeZ = LANE_RAIL_LIMIT;
      this.arcadeVz = 0;
      if (this.arcadeVx > 6 && this.arcadeRailScrapeCooldown <= 0) {
        this.arcadeRailScrapeCooldown = 0.28;
        this.cameraRig.shake(0.05);
      }
    } else if (this.arcadeZ < -LANE_RAIL_LIMIT) {
      this.arcadeZ = -LANE_RAIL_LIMIT;
      this.arcadeVz = 0;
      if (this.arcadeVx > 6 && this.arcadeRailScrapeCooldown <= 0) {
        this.arcadeRailScrapeCooldown = 0.28;
        this.cameraRig.shake(0.05);
      }
    }

    this.arcadeX += this.arcadeVx * dt;
    const distanceReward = Math.floor(this.arcadeX / 250);
    if (distanceReward > this.arcadeDistanceReward) {
      this.rewardEndless(0, 90 * (distanceReward - this.arcadeDistanceReward));
      this.arcadeDistanceReward = distanceReward;
    }
    this.arcadeWheelSpin += (this.arcadeVx / vehicle.wheelRadius) * dt;

    const rampSample = this.scenery?.sampleArcadeRamp?.({
      x: this.arcadeX,
      y: this.arcadeY,
      z: this.arcadeZ,
    }) ?? { onRamp: false, groundY: 0, slopeAngle: 0, boostFactor: 1 };

    if (!this.arcadeAirborne) {
      this.arcadeManeuver = null;
      this.arcadePitchTurn = 0;
      this.arcadeRoll = 0;
      this.arcadeCompleted = 0;
      this.arcadeAirElapsed = 0;

      if (rampSample.onRamp) {
        this.arcadeLastRampBoost = rampSample.boostFactor;
        this.arcadeY = rampSample.groundY;
        this.arcadePitch = lerp(this.arcadePitch, rampSample.slopeAngle, Math.min(1, dt * 18));
        this.arcadeVy = Math.max(
          4.5,
          Math.sin(rampSample.slopeAngle) * this.arcadeVx * rampSample.boostFactor
        );
      } else if (this.arcadeY > 0.14 && this.arcadeVx > 6) {
        this.arcadeAirborne = true;
        this.arcadeVy = Math.max(
          this.arcadeVy,
          ARCADE_TUNING.rampLaunchVy * this.arcadeLastRampBoost
        );

      } else {
        this.arcadeLastRampBoost = 1;
        this.arcadeY = 0;
        this.arcadeVy = 0;
        this.arcadePitch = lerp(this.arcadePitch, 0, Math.min(1, dt * 14));
      }
    }

    const request = controls.arcadeStunt ?? this.arcadeRequest;
    this.arcadeRequest = undefined;
    const floorY = rampSample.groundY;
    if (this.arcadeAirborne) {
      this.arcadeAirTime += dt;
      this.arcadeAirElapsed += dt;
      this.arcadePitch = lerp(this.arcadePitch, 0, Math.min(1, dt * 8));

      if (request && !this.arcadeManeuver) {
        const gravity = ARCADE_TUNING.gravity;
        const height = Math.max(0, this.arcadeY - floorY);
        const landingTime = (this.arcadeVy + Math.sqrt(this.arcadeVy ** 2 + 2 * gravity * height)) / gravity;
        if (landingTime >= 0.58) {
          this.arcadeManeuver = { kind: request, elapsed: 0, duration: Math.min(1.16 - vehicle.stats.spin * 0.002, landingTime - 0.13) };
          this.arcadePitchTurn = 0;
          this.arcadeRoll = 0;
        }
      }

      const maneuver = this.arcadeManeuver;
      if (maneuver) {
        maneuver.elapsed += dt;
        const progress = clamp(maneuver.elapsed / maneuver.duration, 0, 1);
        const angle = Math.PI * 2 * progress * progress * (3 - 2 * progress);
        if (maneuver.kind === "backflip") this.arcadePitchTurn = angle;
        else this.arcadeRoll = angle * (maneuver.kind === "reverseBarrel" ? -1 : 1);
        if (progress === 1) {
          this.arcadeManeuver = null;
          this.arcadeCompleted++;
          if (maneuver.kind === "backflip") this.arcadePitchTurns++;
          else this.arcadeTotalTurns++;
          this.arcadeLastTrick = maneuver.kind === "backflip" ? "TERS TAKLA" : "YAN TAKLA";
          this.rewardEndless(200, 160);
          this.hud.popup(`${this.arcadeLastTrick} · +160 SP`, "trick");
          this.scenery?.cheer?.(this.arcadeX);
        }
      }

      this.arcadeVy += ((thrust ? ARCADE_TUNING.airThrustAccelY : 0) - ARCADE_TUNING.gravity) * dt;
      this.arcadeY += this.arcadeVy * dt;
      this.arcadeMaxHeight = Math.max(this.arcadeMaxHeight, this.arcadeY);
      if (this.arcadeY <= floorY && this.arcadeVy <= 0) {
        this.arcadeY = floorY;
        this.arcadeVy = 0;
        this.arcadeAirborne = false;
        this.arcadeManeuver = null;
        this.arcadePitch = rampSample.slopeAngle;
        this.arcadePitchTurn = 0;
        this.arcadeRoll = 0;
        if (this.arcadeCompleted > 0) {
          this.rewardEndless(100, 90);
          this.hud.popup("TEMİZ İNİŞ · +90 SP", "perfect");
        }
      }
    }

    const totalSpeed = Math.hypot(this.arcadeVx, this.arcadeVy, this.arcadeVz);
    this.arcadeTopSpeed = Math.max(this.arcadeTopSpeed, totalSpeed);

    car.position.x = this.arcadeX;
    car.position.y = this.arcadeY + CAR.comHeight;
    car.position.z = this.arcadeZ;
    car.velocity.x = this.arcadeVx;
    car.velocity.y = this.arcadeVy;
    car.velocity.z = this.arcadeVz;
    car.speed = totalSpeed;
    car.wheelSpin = this.arcadeWheelSpin;
    car.onRamp = rampSample.onRamp;
    car.mode = this.arcadeAirborne ? "airborne" : "grounded";
    car.throttle = Math.max(controls.throttle, thrust ? 0.65 : 0);
    car.brake = controls.brake;
    const flipping = this.arcadeManeuver !== null;
    car.pitch = (flipping ? 0 : this.arcadePitch) + this.arcadePitchTurn;
    car.roll = this.arcadeRoll - (flipping ? 0 : this.arcadeVz * 0.015);
    car.trickPitch = this.arcadePitchTurn;
    car.trickRoll = this.arcadeRoll;
    car.airTime = this.arcadeAirborne ? this.arcadeAirElapsed : 0;
    car.heightAboveGround = Math.max(0, this.arcadeY - rampSample.groundY);
    car.thrusters.fill(thrust ? 1 : 0);

    const yawAngle = -this.arcadeVz * 0.02;
    this.scratchEuler.set(car.roll, yawAngle, car.pitch, "YZX");
    this.scratchQuat.setFromEuler(this.scratchEuler);
    car.quaternion.x = this.scratchQuat.x;
    car.quaternion.y = this.scratchQuat.y;
    car.quaternion.z = this.scratchQuat.z;
    car.quaternion.w = this.scratchQuat.w;

    const traffic = this.scenery?.checkArcadeTrafficJumpOrHit?.({
      x: this.arcadeX,
      y: this.arcadeY,
      z: this.arcadeZ,
    });
    if (traffic === "jumped") {
      this.rewardEndless(120, 100);
      this.hud.popup("TRAFİK ATLAMA · +100 SP", "trick");
    } else if (traffic === "crash") {
      this.triggerArcadeChallengeEnd("obstacle", "Trafik aracı");
    }
  }

  private tick(dt: number, driver: DebugDriver | null): void {
    this.time += dt;
    this.stateTime += dt;
    const isArcade = isArcadeLevelId(this.level.id);

    if (this.state === "menu") {
      if (this.autopilot) {
        this.physics.step(dt, this.autopilot(this.physics.car, dt));
      }
    } else if (this.state === "ready") {
      if (this.readyToGo(driver)) {
        this.enterState("running");
        const ctrl = this.runControls(dt, driver);
        if (isArcade) {
          this.stepArcadeSimulation(dt, ctrl);
        } else {
          this.physics.step(dt, ctrl);
        }
      }
    } else if (stepsPhysics(this.state)) {
      const controls =
        this.state === "result" ? NEUTRAL : this.runControls(dt, driver);

      if (isArcade) {
        if (this.state === "running") {
          this.stepArcadeSimulation(dt, controls);
          const car = this.physics.car;

          const picked = this.crash ? 0 : this.scenery?.consumeArcadePickups?.(car.position) ?? 0;
          if (picked > 0) {
            this.rewardEndless(picked, picked);
            this.hud.popup(`+${picked} SP`, "info");
          }
        }
      } else {
        this.physics.step(dt, controls);
      }
    }

    if (!isArcade) {
      for (const event of this.physics.drainEvents()) this.onPhysicsEvent(event);
      this.watchRollback();
    }
    this.updateTimers(dt);
    this.present(dt);
  }

  private readyToGo(driver: DebugDriver | null): boolean {
    if (driver === "autopilot" || (driver === null && this.autopilot)) {
      return this.stateTime >= AUTOPILOT_START;
    }
    const c = driver ?? this.input.controls;
    return c.throttle > 0.05 || c.brake > 0.05 || c.thrust;
  }

  private runControls(dt: number, driver: DebugDriver | null): Controls {
    const car = this.physics.car;
    if (driver === "autopilot") {
      this.autopilot ??= createAutopilot(this.level, "clean");
      return this.autopilot(car, dt);
    }
    if (driver) return driver;
    return this.autopilot ? this.autopilot(car, dt) : this.input.controls;
  }

  private present(dt: number): void {
    const car = this.viewCar();
    const { position: p, quaternion: q } = car;
    const root = this.playerModel.root;
    root.position.set(p.x, p.y, p.z);
    root.quaternion.set(q.x, q.y, q.z, q.w);
    root.updateMatrixWorld();
    this.playerModel.update(dt, car);
    this.vehicleShadow.update(car);
    this.debugOverlay?.update(car);
    const running = inRun(this.state);
    this.renderer.updateSky(this.profile.theme, this.time);
    this.audio.update(dt, running ? car : null);
    this.cameraRig.update(dt, car);

    if (this.state === "menu" && !this.autopilot) {
      const cam = this.renderer.camera;
      const wide = cam.aspect > 1.15;
      const orbit = Math.sin(this.time * 0.26) * 0.45;
      cam.position.set(p.x + 7.6 + orbit, p.y + 1.5, p.z + 6.1 - orbit);
      cam.lookAt(p.x + (wide ? -1.85 : 0), p.y + (wide ? 0.3 : 0.75), p.z + (wide ? 2.2 : 0));
      cam.fov = wide ? 43 : 54;
      cam.updateProjectionMatrix();
    } else if (isArcadeLevelId(this.level.id) && running) {
      const cam = this.renderer.camera;
      cam.position.set(p.x - 8.5, Math.max(3.7, p.y + 3.2), p.z * 0.76 + 0.85);
      cam.lookAt(p.x + 4.6, p.y + 0.25, p.z * 0.82);
      cam.fov = 52 + clamp(this.arcadeVx / 5, 0, 9) + Math.min(...car.thrusters) * 3;
      cam.updateProjectionMatrix();
    }

    this.renderer.camera.updateMatrixWorld();
    this.fx.update(dt, car, this.playerModel, this.renderer.camera);
    this.scenery?.update(dt, this.time, p);
    if (running) this.hud.update(car, this.level, "metric");
  }

  private viewCar(): CarSnapshot {
    return this.poseOverride ?? this.physics.car;
  }

  private enterState(next: RunState): void {
    this.state = next;
    this.stateTime = 0;
    this.cameraRig.setMode(CAMERA_MODE[next]);
    this.input.setTouchControlsVisible(inRun(next) && !this.paused);
  }

  private loadLevel(id: LevelId): void {
    this.level = getLevel(id);

    const scenery = this.sceneryFor(this.level);
    if (scenery !== this.scenery) {
      const scene = this.renderer.scene;
      if (this.scenery) scene.remove(this.scenery.root);
      scene.add(scenery.root);
      scene.fog = scenery.fog;
      this.scenery = scenery;
    }

    this.physics = new CarPhysics(this.level);
    if (isArcadeLevelId(this.level.id)) {
      scenery.resetArcade?.();
      this.resetArcadePhysics();
      this.physics.car.position.x = 0;
      this.physics.car.position.y = CAR.comHeight;
    }
    this.poseOverride = null;
    this.cameraRig.setLevel(this.level);
    this.input.setSpinAxis(this.level.spinAxis);
    this.fx.clear();
  }

  private sceneryFor(level: LevelDef): Scenery {
    const key = `${level.id}:${this.profile.theme}`;
    let scenery = this.sceneries.get(key);
    if (!scenery) {
      scenery = buildScenery(level, this.renderer.quality, this.profile.theme);
      this.sceneries.set(key, scenery);
    }
    return scenery;
  }

  private prebuildSceneries(): void {
    const build = (): void => {
      for (const id of LEVEL_ORDER) this.sceneryFor(getLevel(id));
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(build, { timeout: 1000 });
    } else {
      setTimeout(build, 300);
    }
  }

  private startRun(id: LevelId): void {
    this.setPaused(false);
    this.loadLevel(id);
    this.lastPlayed = id;
    const style = this.params.autopilot;
    this.autopilot =
      !isArcadeLevelId(id) && style ? createAutopilot(this.level, style) : null;
    this.landing = null;
    this.crash = null;
    this.newBest = false;
    this.launched = false;
    this.rollbackWarned = false;
    this.resultDelay = -1;
    this.hud.showRun(this.level.id === "arcade"
      ? { ...this.level, venue: THEMES[this.profile.theme].name }
      : this.level, this.input.isTouch);
    this.enterState("ready");
    this.cameraRig.snap(this.physics.car);
    this.present(0);
  }

  private enterMenu(): void {
    this.setPaused(false);
    this.resultDelay = -1;
    this.startDemo();
    this.enterState("menu");
    this.cameraRig.snap(this.physics.car);
    this.present(0);
    this.showMenu();
  }

  private startDemo(): void {
    const entry = this.demo.entry;
    this.loadLevel(entry.level);
    this.autopilot = this.params.demo
      ? createAutopilot(this.level, entry.style)
      : null;
    this.demo.restart();
  }

  private showMenu(): void {
    const allLevels: LevelDef[] = LEVEL_ORDER.map(getLevel);
    this.hud.showMenu({
      levels: allLevels,
      best: this.best,
      garage: this.garage,
      muted: this.settings.muted,
      units: "metric",
      isTouch: this.input.isTouch,
      onPlay: (id) => this.fromUi(() => this.startRun(id)),
      onSelectVehicle: (id) => this.fromUi(() => this.selectVehicle(id)),
      onBuyVehicle: (id) => this.fromUi(() => this.buyVehicle(id)),
      onSelectColor: (hex) => this.fromUi(() => this.selectVehicleColor(hex)),
    });
  }

  private showResult(): void {
    this.resultDelay = -1;
    this.enterState("result");
    this.audio.play("result");
    const id = this.level.id;
    this.hud.showResult({
      level: this.level,
      landing: this.landing,
      crash: this.crash,
      best: this.best[id] ?? 0,
      isNewBest: this.newBest,
      credits: id === "arcade" ? this.arcadeCredits : undefined,
      units: "metric",
      onRetry: () => this.fromUi(() => this.startRun(id)),
      onNext: () => this.fromUi(() => this.startRun(nextLevel(id))),
      onMenu: () => this.fromUi(() => this.enterMenu()),
    });
  }

  private setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.needsRender = true;
    if (paused) {
      this.audio.suspend();
      this.input.setTouchControlsVisible(false);
      this.hud.showPause({
        onResume: () => this.fromUi(() => this.setPaused(false)),
        onRestart: () => this.fromUi(() => this.startRun(this.level.id)),
        onMenu: () => this.fromUi(() => this.enterMenu()),
      });
    } else {
      this.hud.hidePause();
      if (!document.hidden) this.audio.resume();
      this.input.setTouchControlsVisible(inRun(this.state));
    }
  }

  private isKickflipClear(): boolean {
    if (String(this.level.id) !== "kickflip") return true;
    const minX =
      typeof this.level.goal.minTouchdownX === "number"
        ? this.level.goal.minTouchdownX
        : 6.5;
    return this.physics.car.position.x >= minX;
  }

  private onPhysicsEvent(e: PhysicsEvent): void {
    const demo = this.state === "menu";
    presentEvent(e, this.presenters, demo);
    if (demo) {
      if (e.type === "settled") this.demo.settled();
      return;
    }
    switch (e.type) {
      case "flip":
        this.scenery?.cheer?.(this.physics.car.position.x);
        break;
      case "launch":
        this.launched = true;
        break;
      case "land": {
        if (String(this.level.id) === "kickflip" && !this.isKickflipClear()) {
          this.landing = null;
          this.resultDelay = -1;
          this.enterState("running");
          this.hud.popup("DEVAM ET — ENGELİ AŞ", "info");
          break;
        }
        this.landing = e.result;
        if (!this.autopilot) {
          this.newBest = submitScore(this.level.id, e.result.score.total);
          this.best = loadBestScores();
        }
        if (this.state === "running") this.enterState("landed");
        break;
      }
      case "crash":
        this.landing = null;
        this.crash = { reason: e.reason, obstacle: e.obstacle };
        if (this.state === "running" || this.state === "landed") {
          this.enterState("wrecked");
        }
        break;
      case "settled":
        if (String(this.level.id) === "kickflip" && !this.isKickflipClear()) {
          this.resultDelay = -1;
          this.enterState("running");
          break;
        }
        if (this.state === "landed" || this.state === "wrecked") {
          this.resultDelay = RESULT_DELAY;
        }
        break;
    }
  }

  private watchRollback(): void {
    if (this.state !== "running" || this.launched) return;
    if (!this.level.goal.requireRampLaunch) return;
    const car = this.physics.car;
    if (!car.onRamp) {
      this.rollbackWarned = false;
    } else if (car.speed < -0.5 && !this.rollbackWarned) {
      this.rollbackWarned = true;
      this.hud.popup("HIZ YETERSİZ", "warn");
    }
  }

  private updateTimers(dt: number): void {
    if (this.state === "menu" && this.autopilot && this.demo.update(dt)) {
      this.demo.next();
      this.startDemo();
      this.cameraRig.snap(this.physics.car);
    }
    if (this.resultDelay >= 0) {
      this.resultDelay -= dt;
      if (this.resultDelay < 0) this.showResult();
    }
  }

  private onAction(action: InputAction): void {
    if (this.driverSetup.visible) return;
    switch (action) {
      case "arcadeBackflip":
      case "arcadeBarrel":
      case "arcadeReverseBarrel":
        if (!this.paused && this.state === "running" && this.level.id === "arcade") {
          this.arcadeRequest ??= action === "arcadeBackflip" ? "backflip"
            : action === "arcadeBarrel" ? "barrel" : "reverseBarrel";
        }
        break;
      case "mute":
        this.toggleMute();
        if (this.state === "menu") this.audio.play("ui");
        break;
      case "restart":
        if (this.state !== "menu") this.startRun(this.level.id);
        break;
      case "pause":
      case "back":
        if (this.paused) this.setPaused(false);
        else if (inRun(this.state)) this.setPaused(true);
        else if (this.state === "result" && action === "back") {
          this.enterMenu();
        }
        break;
      case "confirm":
        if (this.paused) this.setPaused(false);
        else if (this.state === "result") this.startRun(this.level.id);
        else if (this.state === "menu") {
          this.startRun(this.lastPlayed ?? LEVEL_ORDER[0]);
        }
        break;
    }
  }

  private fromUi(action: () => void): void {
    this.audio.unlock();
    action();
    this.audio.play("ui");
  }

  private toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    this.audio.setMuted(this.settings.muted);
    this.hud.setMuted(this.settings.muted);
    saveSettings(this.settings);
  }

  private onVisibility(hidden: boolean): void {
    this.lastFrameTime = -1;
    if (hidden) {
      if (inRun(this.state)) this.setPaused(true);
      this.audio.suspend();
    } else if (!this.paused) {
      this.audio.resume();
    }
  }

  private advance(seconds: number, driver: DebugDriver | null): GameStateInfo {
    this.manual = true;
    const frames = Math.max(0, Math.round(seconds / DEBUG_DT));
    for (let i = 0; i < frames && !this.paused; i++)
      this.tick(DEBUG_DT, driver);
    this.renderer.render();
    return this.stateInfo();
  }

  private stateInfo(): GameStateInfo {
    const cam = this.renderer.camera;
    const menu = this.state === "menu";
    return {
      state: this.paused ? "paused" : this.state,
      level: this.level.id,
      demo: menu && this.params.demo ? { ...this.demo.entry } : null,
      autopilot: !menu && this.autopilot !== null,
      manual: this.manual,
      time: this.time,
      stateTime: this.stateTime,
      camera: {
        position: [cam.position.x, cam.position.y, cam.position.z],
        fov: cam.fov,
      },
      landing: this.landing,
      crash: this.crash,
      best: { ...this.best },
      settings: { ...this.settings },
    };
  }
}

export type { ThrusterLevels };
