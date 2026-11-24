import type {
  CarSnapshot,
  CrashReason,
  InputAction,
  LandingResult,
  LevelDef,
  LevelId,
  Units,
} from "@/core/types";
import {
  createDefaultGarageState,
  type GarageState,
  type VehicleId,
} from "@/core/garage";
import { loadBestScores } from "@/core/storage";
import { LEVEL_ORDER } from "@/levels";
import { INPUT_EVENT, isInputAction } from "@/input/events";
import { PauseCard, ResultCard } from "./cards";
import { detectScheme, type ControlScheme } from "./controls-info";
import { GarageModal } from "./garage-modal";
import { MenuView } from "./menu-view";
import { PopupLayer } from "./popups";
import { RunView } from "./run-view";
import { Toggles } from "./toggles";
import "./hud.css";

export interface MenuOptions {
  levels: LevelDef[];
  best: Partial<Record<LevelId, number>>;
  garage?: GarageState;
  muted: boolean;
  units: Units;
  isTouch: boolean;
  onPlay(id: LevelId): void;
  onSelectVehicle?(id: VehicleId): void;
  onBuyVehicle?(id: VehicleId): void;
  onSelectColor?(colorHex: string): void;
}

export interface ResultOptions {
  level: LevelDef;
  landing: LandingResult | null;
  crash: { reason: CrashReason; obstacle?: string } | null;
  best: number;
  isNewBest: boolean;
  credits?: number;
  units: Units;
  onRetry(): void;
  onNext(): void;
  onMenu(): void;
}

export interface PauseOptions {
  onResume(): void;
  onRestart(): void;
  onMenu(): void;
}

export type PopupKind = "trick" | "info" | "warn" | "perfect";

export class Hud {
  private readonly root: HTMLElement;
  private readonly menuToggles: Toggles;
  private readonly pauseToggles: Toggles;
  private readonly menu: MenuView;
  private readonly run: RunView;
  private readonly popups = new PopupLayer();
  private readonly result: ResultCard;
  private readonly pause: PauseCard;
  private readonly garageModal = new GarageModal();

  private garage = createDefaultGarageState();
  private level: LevelDef | null = null;
  private muted = false;
  private units: Units = "metric";
  private isTouch = false;
  private scheme: ControlScheme = "keyboard";
  private readonly best: Partial<Record<LevelId, number>>;
  private readonly howToSeen = new Set<LevelId>();
  private rotateHintShown = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.best = { ...loadBestScores() };

    this.menuToggles = new Toggles();
    this.pauseToggles = new Toggles();
    this.menu = new MenuView(this.menuToggles);
    this.run = new RunView();
    this.result = new ResultCard();
    this.pause = new PauseCard(this.pauseToggles);

    root.classList.add("hud-root");
    root.append(
      this.run.el,
      this.popups.el,
      this.menu.el,
      this.garageModal.el,
      this.result.el,
      this.pause.el
    );
    this.syncToggles();

    window.addEventListener(INPUT_EVENT, this.onInputAction);
    window.addEventListener("gamepadconnected", this.onGamepad);
    window.addEventListener("gamepaddisconnected", this.onGamepad);
  }

  mountDriverMenu(button: HTMLButtonElement): void {
    this.menu.el.querySelector(".menu-foot")?.append(button);
  }

  showMenu(opts: MenuOptions): void {
    this.muted = opts.muted;
    this.units = opts.units;
    this.isTouch = opts.isTouch;
    this.scheme = detectScheme(opts.isTouch);
    Object.assign(this.best, opts.best);
    const garage = this.garage = opts.garage ?? createDefaultGarageState();
    this.run.hide();
    this.result.hide();
    this.pause.hide();
    this.popups.clear();
    this.syncToggles();
    this.menu.show({
      levels: opts.levels,
      best: opts.best,
      garage,
      scheme: this.scheme,
      onPlay: (id) => opts.onPlay(id),
      onOpenGarage: () => {
        this.garageModal.open(this.garage, {
          onSelectVehicle: (id) => opts.onSelectVehicle?.(id),
          onBuyVehicle: (id) => opts.onBuyVehicle?.(id),
          onSelectColor: (hex) => opts.onSelectColor?.(hex),
          onClose: () => {
            this.menu.updateGarage(this.garage);
          },
        });
      },
      autofocus: !opts.isTouch,
    });
  }

  syncGarage(garage: GarageState): void {
    this.garage = garage;
    this.menu.updateGarage(garage);
    this.garageModal.sync(garage);
  }

  showRun(level: LevelDef, isTouch: boolean): void {
    this.garageModal.hide();
    this.level = level;
    this.isTouch = isTouch;
    this.scheme = detectScheme(isTouch);
    this.menu.hide();
    this.result.hide();
    this.pause.hide();
    this.popups.clear();
    const firstRun = !this.howToSeen.has(level.id);
    this.howToSeen.add(level.id);
    const rotateHint =
      isTouch &&
      !this.rotateHintShown &&
      matchMedia("(orientation: portrait)").matches;
    if (rotateHint) this.rotateHintShown = true;
    this.run.show(level, this.scheme, isTouch, this.best[level.id], {
      howTo: firstRun,
      rotateHint,
    });
    this.run.el.inert = false;
  }

  update(car: CarSnapshot, level: LevelDef, units: Units): void {
    if (units !== this.units) this.setUnits(units);
    this.run.update(car, level, units);
  }

  setEndlessScore(score: number, credits: number): void {
    this.run.setEndlessScore(score.toLocaleString("tr-TR"), credits.toLocaleString("tr-TR"));
  }

  popup(text: string, kind: PopupKind = "info"): void {
    this.popups.show(text, kind);
  }

  showResult(opts: ResultOptions): void {
    if (opts.best > 0) this.best[opts.level.id] = opts.best;
    this.level = opts.level;
    this.units = opts.units;
    this.syncToggles();
    this.pause.hide();
    this.menu.hide();
    this.run.hide();
    const stuntNumber = Math.max(0, LEVEL_ORDER.indexOf(opts.level.id)) + 1;
    this.result.show(opts, this.scheme, this.run.attitude, stuntNumber);
  }

  showPause(opts: PauseOptions): void {
    this.run.el.inert = true;
    const leave = (fn: () => void) => () => {
      this.hidePause();
      fn();
    };
    this.pause.show(
      {
        onResume: leave(() => opts.onResume()),
        onRestart: leave(() => opts.onRestart()),
        onMenu: leave(() => opts.onMenu()),
      },
      this.level,
      this.scheme
    );
  }

  hidePause(): void {
    this.pause.hide();
    this.run.el.inert = false;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.syncToggles();
  }

  setUnits(units: Units): void {
    this.units = units;
    this.syncToggles();
    this.run.setUnits(units);
    this.result.setUnits(units);
  }

  dispose(): void {
    window.removeEventListener(INPUT_EVENT, this.onInputAction);
    window.removeEventListener("gamepadconnected", this.onGamepad);
    window.removeEventListener("gamepaddisconnected", this.onGamepad);
    this.popups.clear();
    this.result.hide();
    for (const el of [
      this.run.el,
      this.popups.el,
      this.menu.el,
      this.garageModal.el,
      this.result.el,
      this.pause.el,
    ]) {
      el.remove();
    }
    this.root.classList.remove("hud-root");
  }

  private syncToggles(): void {
    this.menuToggles.sync(this.muted);
    this.pauseToggles.sync(this.muted);
    this.run.setMuted(this.muted);
  }

  private readonly onInputAction = (e: Event): void => {
    if (this.root.querySelector(".driver-dialog[open]")) {
      e.preventDefault();
      return;
    }
    const action: unknown = (e as CustomEvent<unknown>).detail;
    if (!isInputAction(action)) return;
    if (this.garageModal.visible && (action === "back" || action === "pause")) {
      e.preventDefault();
      this.garageModal.hide();
      return;
    }
    const overlay = this.pause.visible
      ? this.pause
      : this.result.visible
        ? this.result
        : null;
    const mapped = mapOverlayAction(action);
    if (overlay) {
      if (!mapped) return;
      e.preventDefault();
      overlay.handle(mapped);
    } else if (this.menu.visible && mapped) {
      e.preventDefault();
      if (mapped === "confirm") this.menu.playFocusedOrFirst();
    }
  };

  private readonly onGamepad = (): void => {
    if (this.isTouch) return;
    this.scheme = detectScheme(false);
    this.menu.setScheme(this.scheme);
  };
}

function mapOverlayAction(
  action: InputAction
): "confirm" | "restart" | "back" | null {
  switch (action) {
    case "confirm":
    case "restart":
      return action;
    case "back":
    case "pause":
      return "back";
    default:
      return null;
  }
}
