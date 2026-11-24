import type { InputAction, CarSnapshot, LevelDef, Units } from "@/core/types";
import { clamp, lengthIn, offFullTurn, speedIn } from "@/core/math";
import { dispatchAction } from "@/input/events";
import {
  axisLabel,
  hintSegments,
  type ControlScheme,
  type HintId,
} from "./controls-info";
import {
  ClassFlag,
  NumberText,
  TransformSlot,
  h,
  icon,
  onPress,
  replayClass,
  segmentNode,
  setChildren,
} from "./dom";
import {
  formatBest,
  formatSpeedRange,
  lengthUnit,
  speedUnit,
  type Attitude,
} from "./format";
import { CAR_REAR, CAR_SIDE, ICONS } from "./icons";

const RAD2DEG = 180 / Math.PI;
const SPEED_BAR_SCALE = 1.4;
const AIR_LINGER = 1400;
const HINT_BITS: Record<HintId, number> = {
  go: 1,
  flipBack: 2,
  roll: 4,
  landSoft: 8,
  liftOff: 16,
};
const HINT_DURATION: Record<HintId, number> = {
  go: Number.POSITIVE_INFINITY,
  flipBack: 3200,
  roll: 3000,
  landSoft: 2600,
  liftOff: 3200,
};
const SVG_NS = "http://www.w3.org/2000/svg";

const LEVEL_TR_RUN: Record<string, { title: string; venue: string; howTo: string[] }> = {
  backflip: {
    title: "TERS TAKLA",
    venue: "EĞİK RAMPA",
    howTo: [
      "Pist boyunca hızlan ve rampaya gir.",
      "Araç düzelene kadar geriye doğru dönüşü sürdür.",
      "Piste yumuşak inmek için soğuk gaz iticilerini ateşle.",
    ],
  },
  kickflip: {
    title: "YAN TAKLA",
    venue: "ARAÇ DİZİLİMİ",
    howTo: [
      "Hızlan ve araçların önünde soğuk gaz iticileriyle yerden havalan.",
      "Havada yan dönüş yap ve iniş için aracı düzelt.",
      "Beş aracın da ilerisine temiz bir iniş yap.",
    ],
  },
};

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs))
    el.setAttribute(name, String(value));
  return el;
}

function liftLevel(car: CarSnapshot): number {
  const t = car.thrusters;
  return Math.min(t[0], t[1], t[2], t[3]);
}

export function lineupStartX(level: LevelDef): number {
  let x = Number.POSITIVE_INFINITY;
  for (const o of level.obstacles) {
    for (const [px] of o.polygon) x = Math.min(x, px);
  }
  return x;
}

export class RunView {
  readonly el: HTMLElement;
  readonly attitude: Attitude = { pitch: 0, roll: 0 };

  private readonly name = h("div", { class: "run-name" });
  private readonly venue = h("div", { class: "run-venue" });
  private readonly bestValue = h("span", { class: "run-best-val" }, "—");
  private readonly muteIcon = icon(ICONS.soundOn);
  private readonly muteButton = h(
    "button",
    {
      type: "button",
      class: "hud-icon-btn run-mute",
      "aria-label": "Sesi Kapat",
      "aria-pressed": "false",
    },
    this.muteIcon
  );
  private readonly howTo = h("ol", { class: "run-howto hud-glass" });
  private readonly coach = h("div", { class: "run-coach" });
  private readonly hintEl = h("div", { class: "run-hint", role: "status" });
  private readonly speedUnitEl = h("span", { class: "speed-unit" });
  private readonly targetEl = h("span", { class: "speed-target-val" });
  private readonly band = h("div", { class: "sb-band" });
  private readonly speedText: NumberText;
  private readonly speedFill: TransformSlot;
  private readonly speedMarker: TransformSlot;
  private readonly gasText: NumberText;
  private readonly jetsActive: ClassFlag;
  private readonly stuntButtons = h("div", { class: "arcade-stunts", hidden: true });
  private readonly endlessScore = h("span", { class: "arcade-score", hidden: true });
  private readonly endlessScoreValue = h("strong", null, "0");
  private readonly endlessCreditsValue = h("strong", null, "0");
  private readonly gasFill: TransformSlot;
  private readonly inBand: ClassFlag;
  private readonly reverse: ClassFlag;
  private readonly gasLow: ClassFlag;

  private readonly air: HTMLElement;
  private readonly airOn: ClassFlag;
  private readonly heightText: NumberText;
  private readonly heightUnit = h("span", { class: "air-unit" });
  private readonly airTimeText: NumberText;
  private readonly degText: NumberText;
  private readonly axisEl = h("span", { class: "dial-axis" });
  private readonly turnsEl = h("span", { class: "dial-turns" });
  private readonly dialArc: SVGCircleElement;
  private readonly dialCar: SVGGElement;
  private readonly dialCarSlot: TransformSlot;
  private readonly dialCcw: ClassFlag;
  private readonly dialDone: ClassFlag;
  private readonly dialLevel: ClassFlag;
  private lastArc = -1;
  private lastTurns = -1;

  private level: LevelDef | null = null;
  private scheme: ControlScheme = "keyboard";
  private units: Units = "metric";
  private lastCar: CarSnapshot | null = null;
  private speedScale = 1;
  private lineupX = Number.POSITIVE_INFINITY;
  private airUntil = 0;
  private hintMask = 0;
  private hint: HintId | null = null;
  private hintUntil = 0;

  constructor() {
    const pauseButton = h(
      "button",
      {
        type: "button",
        class: "hud-icon-btn run-pause",
        "aria-label": "Duraklat",
      },
      icon(ICONS.pause)
    );
    onPress(this.muteButton, () => dispatchAction("mute"));
    onPress(pauseButton, () => dispatchAction("pause"));

    const speedDigits = h("span", { class: "speed-val" }, "0");
    const fill = h("div", { class: "sb-fill" });
    const rail = h("div", { class: "sb-rail" }, h("i", { class: "sb-marker" }));
    const speed = h(
      "div",
      { class: "run-speed" },
      h(
        "div",
        { class: "speed-row" },
        speedDigits,
        h(
          "span",
          { class: "speed-meta" },
          this.speedUnitEl,
          h("span", { class: "speed-gear" }, "R")
        )
      ),
      h(
        "div",
        { class: "speed-bar" },
        h("div", { class: "sb-track" }),
        this.band,
        fill,
        rail
      ),
      h(
        "div",
        { class: "speed-target" },
        h("span", { class: "hud-label" }, "HEDEF"),
        this.targetEl
      )
    );
    this.speedText = new NumberText(speedDigits);
    this.speedFill = new TransformSlot(fill, (v) => `scaleX(${v})`);
    this.speedMarker = new TransformSlot(
      rail,
      (v) => `translateX(${v * 100}%)`
    );

    const gasDigits = h("span", { class: "gas-val" }, "100");
    const gasFill = h("div", { class: "gb-fill" });
    const gas = h(
      "div",
      { class: "run-gas" },
      h(
        "div",
        { class: "gas-row" },
        h("span", { class: "hud-label" }, "SOĞUK GAZ"),
        h(
          "span",
          { class: "gas-num" },
          gasDigits,
          h("span", { class: "gas-pct" }, "%")
        )
      ),
      h("div", { class: "gas-bar" }, h("div", { class: "gb-track" }), gasFill)
    );
    this.gasText = new NumberText(gasDigits);
    this.gasFill = new TransformSlot(gasFill, (v) => `scaleX(${v})`);

    this.endlessScore.append("PUAN ", this.endlessScoreValue, " · S Point ", this.endlessCreditsValue, " SP");
    const cluster = h(
      "div",
      { class: "run-cluster hud-glass" },
      speed,
      h("div", { class: "cluster-rule" }),
      gas,
      this.endlessScore
    );
    this.inBand = new ClassFlag(cluster, "is-in-band");
    this.reverse = new ClassFlag(cluster, "is-reverse");
    this.gasLow = new ClassFlag(cluster, "is-gas-low");
    this.jetsActive = new ClassFlag(cluster, "is-jets-active");

    const dial = svgEl("svg", {
      class: "dial",
      viewBox: "0 0 120 120",
      "aria-hidden": "true",
    });
    dial.append(
      svgEl("circle", { class: "dial-track", cx: 60, cy: 60, r: 52 }),
      svgEl("circle", { class: "dial-done", cx: 60, cy: 60, r: 52 })
    );
    this.dialArc = svgEl("circle", {
      class: "dial-arc",
      cx: 60,
      cy: 60,
      r: 52,
      pathLength: 360,
    });
    dial.append(this.dialArc);
    const ticks = svgEl("g", { class: "dial-ticks" });
    for (const [x1, y1, x2, y2] of [
      [60, 1, 60, 13],
      [119, 60, 109, 60],
      [60, 119, 60, 109],
      [1, 60, 11, 60],
    ]) {
      ticks.append(svgEl("line", { x1, y1, x2, y2 }));
    }
    dial.append(ticks);
    this.dialCar = svgEl("g", { class: "dial-car" });
    dial.append(this.dialCar);
    this.dialCarSlot = new TransformSlot(
      this.dialCar,
      (v) => `rotate(${v}deg)`,
      0.5
    );

    const degDigits = h("span", { class: "dial-deg-val" }, "0");
    const heightDigits = h("span", { class: "air-val" }, "0.0");
    const airDigits = h("span", { class: "air-val" }, "0.0");
    this.air = h(
      "div",
      { class: "run-air hud-glass", "aria-hidden": "true" },
      dial,
      h(
        "div",
        { class: "air-side" },
        h(
          "div",
          { class: "dial-readout" },
          h(
            "span",
            { class: "dial-deg" },
            degDigits,
            h("span", { class: "dial-deg-unit" }, "°")
          ),
          h("span", { class: "dial-meta" }, this.axisEl, this.turnsEl)
        ),
        h(
          "div",
          { class: "air-stats" },
          h(
            "div",
            { class: "air-stat" },
            h("span", { class: "hud-label" }, "YÜKSEKLİK"),
            h("span", { class: "air-num" }, heightDigits, this.heightUnit)
          ),
          h(
            "div",
            { class: "air-stat" },
            h("span", { class: "hud-label" }, "HAVA"),
            h(
              "span",
              { class: "air-num" },
              airDigits,
              h("span", { class: "air-unit" }, "sn")
            )
          )
        )
      )
    );
    this.degText = new NumberText(degDigits);
    this.heightText = new NumberText(heightDigits, 1);
    this.airTimeText = new NumberText(airDigits, 1);
    this.airOn = new ClassFlag(this.air, "is-on");
    this.dialCcw = new ClassFlag(this.air, "is-ccw");
    this.dialDone = new ClassFlag(this.air, "is-turned");
    this.dialLevel = new ClassFlag(this.air, "is-level");

    const stunts: [InputAction, string, string, string][] = [
      ["arcadeReverseBarrel", "Q", "LB", "Sola yan takla"],
      ["arcadeBarrel", "E", "RB", "Sağa yan takla"],
      ["arcadeBackflip", "X", "X", "Ters takla"],
    ];
    for (const [action, keyboard, pad, label] of stunts) {
      const key = h("kbd", null, keyboard);
      key.dataset.keyboard = keyboard;
      key.dataset.gamepad = pad;
      const button = h("button", { type: "button", class: "hud-btn", "aria-label": label }, key, label);
      onPress(button, () => dispatchAction(action));
      this.stuntButtons.append(button);
    }
    this.coach.append(this.hintEl);
    this.el = h(
      "section",
      { class: "hud-run", hidden: true, "aria-label": "Oyun" },
      h(
        "header",
        { class: "run-top" },
        h(
          "div",
          { class: "run-title" },
          h("span", { class: "run-accent" }),
          h("div", null, this.name, this.venue)
        ),
        h(
          "div",
          { class: "run-actions" },
          h(
            "div",
            { class: "run-best" },
            h("span", { class: "hud-label" }, "REKOR"),
            this.bestValue
          ),
          this.muteButton,
          pauseButton
        )
      ),
      this.howTo,
      this.coach,
      this.air,
      this.stuntButtons,
      cluster
    );
    this.el.addEventListener("mousedown", (e) => {
      if (e.target instanceof Element && e.target.closest("button"))
        e.preventDefault();
    });
  }

  show(
    level: LevelDef,
    scheme: ControlScheme,
    isTouch: boolean,
    best: number | undefined,
    options: { howTo: boolean; rotateHint: boolean }
  ): void {
    this.level = level;
    this.scheme = scheme;
    this.lastCar = null;
    this.el.dataset.scheme = scheme;
    this.el.classList.toggle("is-touch", isTouch);
    const tr = LEVEL_TR_RUN[level.id];
    this.name.textContent = tr?.title ?? level.title;
    this.venue.textContent = tr?.venue ?? level.venue;
    this.bestValue.textContent = formatBest(best);

    this.speedScale = level.speedHint[1] * SPEED_BAR_SCALE;
    this.band.style.left = `${(level.speedHint[0] / this.speedScale) * 100}%`;
    this.band.style.width = `${((level.speedHint[1] - level.speedHint[0]) / this.speedScale) * 100}%`;
    this.lineupX = lineupStartX(level);
    this.dialCar.innerHTML = level.spinAxis === "pitch" ? CAR_SIDE : CAR_REAR;
    this.axisEl.textContent = axisLabel(level.spinAxis);
    this.renderUnits();

    this.speedText.set(0);
    this.speedFill.set(0);
    this.speedMarker.set(0);
    this.stuntButtons.hidden = level.id !== "arcade";
    for (const key of this.stuntButtons.querySelectorAll("kbd")) {
      key.hidden = isTouch;
      key.textContent = scheme === "gamepad" ? key.dataset.gamepad ?? "" : key.dataset.keyboard ?? "";
    }
    this.endlessScore.hidden = level.id !== "arcade";
    this.endlessScoreValue.textContent = "0";
    this.endlessCreditsValue.textContent = "0";
    this.jetsActive.set(false);
    this.gasText.set(100);
    this.gasFill.set(1);
    this.inBand.set(false);
    this.reverse.set(false);
    this.gasLow.set(false);
    this.airUntil = 0;
    this.airOn.set(false);
    this.resetDial();
    this.attitude.pitch = 0;
    this.attitude.roll = 0;

    const lines = tr?.howTo ?? level.howTo;
    setChildren(
      this.howTo,
      ...lines.map((line) => h("li", null, line)),
      options.rotateHint
        ? h(
            "li",
            { class: "howto-rotate" },
            icon(ICONS.rotatePhone),
            "Daha geniş görüş için telefonunu yan çevir"
          )
        : null
    );
    this.howTo.classList.toggle("is-on", options.howTo);
    this.hintMask = 0;
    this.hint = null;
    this.hintEl.classList.remove("is-on");
    this.showHint("go", performance.now());

    this.el.hidden = false;
    replayClass(this.el, "is-entering");
  }

  hide(): void {
    this.el.hidden = true;
  }

  setEndlessScore(score: string, credits: string): void {
    this.endlessCreditsValue.textContent = credits;
    this.endlessScoreValue.textContent = score;
  }

  setMuted(muted: boolean): void {
    this.muteButton.setAttribute("aria-pressed", String(muted));
    this.muteIcon.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    this.muteButton.classList.toggle("is-off", muted);
  }

  setUnits(units: Units): void {
    if (units === this.units) return;
    this.units = units;
    this.renderUnits();
    const car = this.lastCar;
    if (car && this.level) this.update(car, this.level, units);
  }

  update(car: CarSnapshot, level: LevelDef, units: Units): void {
    if (units !== this.units) {
      this.units = units;
      this.renderUnits();
    }
    this.lastCar = car;
    const now = performance.now();
    const speed = Math.abs(car.speed);
    const grounded = car.mode === "grounded";
    const airborne = car.mode === "airborne";

    this.speedText.set(speedIn(speed, units));
    const p = clamp(speed / this.speedScale, 0, 1);
    this.speedFill.set(p);
    this.speedMarker.set(p);
    this.inBand.set(
      grounded && speed >= level.speedHint[0] && speed <= level.speedHint[1]
    );
    this.reverse.set(grounded && car.speed < -0.5);

    this.gasText.set(car.gas * 100);
    this.gasFill.set(clamp(car.gas, 0, 1));
    this.gasLow.set(car.gas < 0.2);
    this.jetsActive.set(liftLevel(car) > 0.5);

    if (airborne) {
      this.airUntil = now + AIR_LINGER;
      this.heightText.set(lengthIn(Math.max(0, car.heightAboveGround), units));
      this.airTimeText.set(car.airTime);
      this.updateDial(car, level);
    }
    this.airOn.set(car.mode !== "crashed" && (airborne || now < this.airUntil));

    if (car.mode !== "crashed") {
      this.attitude.pitch = car.pitch;
      this.attitude.roll = car.roll;
    }
    this.updateHints(car, level, now);
  }

  private renderUnits(): void {
    const level = this.level;
    this.speedUnitEl.textContent = speedUnit(this.units);
    this.heightUnit.textContent = lengthUnit(this.units);
    if (level) {
      this.targetEl.textContent = `${formatSpeedRange(level.speedHint, this.units)} ${speedUnit(this.units).toLowerCase()}`;
    }
    this.speedText.invalidate();
    this.heightText.invalidate();
  }

  private resetDial(): void {
    this.lastArc = -1;
    this.lastTurns = -1;
    this.setDial(0, false);
    this.dialCarSlot.set(0);
    this.dialCcw.set(false);
    this.dialLevel.set(true);
    this.degText.set(0);
  }

  private updateDial(car: CarSnapshot, level: LevelDef): void {
    const pitchAxis = level.id === "arcade" ? Math.abs(car.trickPitch) > 0 : level.spinAxis === "pitch";
    if (level.id === "arcade") {
      const axis = pitchAxis ? "pitch" : "roll";
      const label = axisLabel(axis);
      if (this.axisEl.textContent !== label) {
        this.axisEl.textContent = label;
        this.dialCar.innerHTML = pitchAxis ? CAR_SIDE : CAR_REAR;
      }
    }
    const deg = (pitchAxis ? car.trickPitch : car.trickRoll) * RAD2DEG;
    const screen = pitchAxis ? -deg : deg;
    this.degText.set(Math.abs(deg));
    this.dialCcw.set(screen < 0);
    this.dialCarSlot.set(screen);
    this.dialLevel.set(
      offFullTurn(car.pitch) < 0.35 && offFullTurn(car.roll) < 0.35
    );
    this.setDial(Math.abs(deg), true);
  }

  private setDial(absDeg: number, live: boolean): void {
    const turns = Math.floor(absDeg / 360 + 1e-6);
    const arc = Math.round(absDeg - turns * 360);
    if (arc !== this.lastArc) {
      this.lastArc = arc;
      this.dialArc.style.strokeDashoffset = String(360 - arc);
    }
    if (turns !== this.lastTurns) {
      this.lastTurns = turns;
      this.dialDone.set(live && turns >= 1);
      this.turnsEl.textContent = turns >= 2 ? `×${turns}` : "";
    }
  }

  private showHint(id: HintId, now: number): void {
    if (this.hintMask & HINT_BITS[id]) return;
    this.hintMask |= HINT_BITS[id];
    this.hint = id;
    this.hintUntil = now + HINT_DURATION[id];
    this.hintEl.replaceChildren(
      ...hintSegments(id, this.scheme).map((seg) =>
        typeof seg === "string" ? h("span", null, seg) : segmentNode(seg)
      )
    );
    replayClass(this.hintEl, "is-on");
  }

  private hideHint(): void {
    if (this.hint === "go") this.howTo.classList.remove("is-on");
    this.hint = null;
    this.hintEl.classList.remove("is-on");
  }

  private updateHints(car: CarSnapshot, level: LevelDef, now: number): void {
    const grounded = car.mode === "grounded";
    const airborne = car.mode === "airborne";
    const pitchAxis = level.spinAxis === "pitch";
    const trick = Math.abs(pitchAxis ? car.trickPitch : car.trickRoll);
    const lift = liftLevel(car);

    if (this.hint) {
      let keep = now < this.hintUntil && car.mode !== "crashed";
      switch (this.hint) {
        case "go":
          keep = grounded && Math.abs(car.speed) < 1;
          break;
        case "roll":
          keep &&= airborne && trick < Math.PI / 3;
          break;
        case "landSoft":
          keep &&= airborne && lift < 0.9;
          break;
        case "liftOff":
          keep &&= grounded && car.position.x < this.lineupX;
          break;
        case "flipBack":
          break;
      }
      if (!keep) this.hideHint();
      else return;
    }

    if (car.mode === "crashed") return;
    if (pitchAxis && grounded && car.onRamp && car.speed > 1) {
      this.showHint("flipBack", now);
    } else if (
      !pitchAxis &&
      airborne &&
      car.heightAboveGround > 1 &&
      trick < Math.PI / 9
    ) {
      this.showHint("roll", now);
    } else if (
      airborne &&
      trick > Math.PI &&
      offFullTurn(car.pitch) < 0.5 &&
      offFullTurn(car.roll) < 0.5 &&
      car.velocity.y < -2.5 &&
      lift < 0.5 &&
      car.gas > 0.02 &&
      car.heightAboveGround > 2
    ) {
      this.showHint("landSoft", now);
    } else if (grounded && car.speed > 3) {
      const ahead = this.lineupX - car.position.x;
      if (ahead > 0 && ahead < 45) this.showHint("liftOff", now);
    }
  }
}
