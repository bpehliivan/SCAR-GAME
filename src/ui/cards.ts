import type { LandingGrade, LevelDef, Units } from "@/core/types";
import { DEG } from "@/core/math";
import { buttonKey, type ControlScheme } from "./controls-info";
import { h, icon, keycap, onPress, replayClass, setChildren } from "./dom";
import {
  SHORT_LINE,
  SHORT_TIP,
  crashReasonLine,
  crashTip,
  formatBest,
  formatLength,
  formatMultiplier,
  formatScore,
  formatSeconds,
  formatSpeed,
  localizeTrickName,
  resultKind,
  stuntLabel,
  type Attitude,
} from "./format";
import type { PauseOptions, ResultOptions } from "./hud";
import { ICONS } from "./icons";
import type { Toggles } from "./toggles";

let idCounter = 0;

const GRADE_WORD: Record<LandingGrade, string> = {
  perfect: "Mükemmel",
  great: "Harika",
  good: "İyi",
};

function button(
  label: string,
  iconSvg: string,
  key: string | null,
  primary = false
): HTMLButtonElement {
  return h(
    "button",
    { type: "button", class: `hud-btn${primary ? " hud-btn--primary" : ""}` },
    icon(iconSvg),
    h("span", null, label),
    key ? keycap(key) : null
  );
}

function row(label: string, value: string, className = ""): HTMLElement {
  return h(
    "div",
    { class: `rc-row ${className}` },
    h("dt", null, label),
    h("dd", null, value)
  );
}

function autofocus(el: HTMLElement, scheme: ControlScheme): void {
  if (scheme !== "touch") el.focus({ preventScroll: true });
}

function activateFocused(card: HTMLElement, fallback: () => void): void {
  const focused = document.activeElement;
  if (focused instanceof HTMLButtonElement && card.contains(focused))
    focused.click();
  else fallback();
}

export class ResultCard {
  readonly el: HTMLElement;
  private readonly card = h("div", { class: "hud-card result-card" });
  private readonly titleId = `rc-title-${++idCounter}`;
  private opts: ResultOptions | null = null;
  private stats: HTMLElement | null = null;
  private locked = false;
  private raf = 0;

  constructor() {
    this.el = h(
      "section",
      {
        class: "hud-result hud-overlay",
        hidden: true,
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": this.titleId,
      },
      this.card
    );
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(
    opts: ResultOptions,
    scheme: ControlScheme,
    attitude: Attitude,
    stuntNumber: number
  ): void {
    this.opts = opts;
    this.locked = false;
    const { level, landing, crash } = opts;
    const endless = level.id === "arcade";
    const kind = endless ? "crash" : resultKind(landing);

    let title: string;
    let sub: string;
    let tip = "";
    if (endless) {
      title = "KOŞU TAMAMLANDI";
      sub = crash?.obstacle ?? "Sonsuz";
    } else if (landing && kind === "landed") {
      title = localizeTrickName(landing.trick.name);
      sub = `${GRADE_WORD[landing.grade]} iniş`;
    } else if (landing) {
      title = "KISA KALDI";
      sub = SHORT_LINE;
      tip = SHORT_TIP;
    } else {
      title = "KAZA YAPILDI";
      sub = crashReasonLine(
        crash?.reason ?? "impact",
        crash?.obstacle,
        attitude
      );
      tip = crashTip(
        crash?.reason ?? "impact",
        level.spinAxis,
        crash?.obstacle
      );
    }

    const retry = button(
      "Tekrar",
      ICONS.retry,
      buttonKey(scheme, "retry"),
      true
    );
    const next = button("Sonraki", ICONS.next, null);
    const menu = button("Menü", ICONS.menu, null);
    onPress(retry, () => this.run((o) => o.onRetry()));
    onPress(next, () => this.run((o) => o.onNext()));
    onPress(menu, () => this.run((o) => o.onMenu()));

    const totalValue = h("span", { class: "rc-total-val" }, "0");
    const total = landing?.score.total ?? 0;
    this.stats = landing ? h("dl", { class: "rc-stats" }) : null;

    this.card.className = `hud-card result-card is-${kind}`;
    setChildren(
      this.card,
      h(
        "div",
        { class: "rc-eyebrow" },
        endless ? level.title : `${stuntLabel(stuntNumber)} · ${level.title}`
      ),
      h(
        "div",
        { class: "rc-head" },
        h(
          "div",
          { class: "rc-heading" },
          h("h2", { class: "rc-title", id: this.titleId }, title),
          h("p", { class: "rc-sub" }, sub),
          tip ? h("p", { class: "rc-tip" }, tip) : null
        ),
        landing && kind === "landed"
          ? h(
              "div",
              { class: `rc-grade is-${landing.grade}` },
              h(
                "span",
                { class: "rc-grade-name" },
                GRADE_WORD[landing.grade].toUpperCase()
              ),
              h(
                "span",
                { class: "rc-grade-mult" },
                formatMultiplier(landing.score.multiplier)
              )
            )
          : null
      ),
      landing
        ? h(
            "div",
            { class: "rc-body" },
            h(
              "dl",
              { class: "rc-breakdown", hidden: endless },
              row(
                kind === "landed" ? "Takla Puanı" : "Takla · eksik",
                formatScore(landing.score.trick)
              ),
              row("Hava Süresi", formatScore(landing.score.air)),
              row("Yükseklik", formatScore(landing.score.height)),
              row("Kalan Yakıt", formatScore(landing.score.gas)),
              row(
                "İniş Çarpanı",
                formatMultiplier(landing.score.multiplier),
                "is-mult"
              )
            ),
            this.stats
          )
        : null,
      h(
        "div",
        { class: "rc-score" },
        opts.credits === undefined ? null : h("div", { class: "rc-best" },
          h("span", { class: "hud-label" }, "S Point"),
          h("span", { class: "rc-best-val" }, `${formatScore(opts.credits)} SP`)
        ),
        h(
          "div",
          { class: "rc-total" },
          h("span", { class: "hud-label" }, "KAZANILAN PUAN"),
          totalValue,
          opts.isNewBest ? h("span", { class: "rc-new" }, "YENİ REKOR") : null
        ),
        h(
          "div",
          { class: "rc-best" },
          h("span", { class: "hud-label" }, "REKOR"),
          h("span", { class: "rc-best-val" }, formatBest(opts.best))
        )
      ),
      h("div", { class: "rc-actions" }, retry, endless ? null : next, menu)
    );
    this.renderStats(opts.units);

    this.el.hidden = false;
    replayClass(this.el, "is-entering");
    this.countUp(totalValue, total);
    autofocus(retry, scheme);
  }

  hide(): void {
    this.el.hidden = true;
    this.opts = null;
    cancelAnimationFrame(this.raf);
  }

  setUnits(units: Units): void {
    if (this.opts && this.opts.units !== units) {
      this.opts = { ...this.opts, units };
      this.renderStats(units);
    }
  }

  handle(action: "confirm" | "restart" | "back"): void {
    if (action === "confirm")
      activateFocused(this.card, () => this.run((o) => o.onRetry()));
    else if (action === "restart") this.run((o) => o.onRetry());
    else this.run((o) => o.onMenu());
  }

  private run(fn: (opts: ResultOptions) => void): void {
    const opts = this.opts;
    if (!opts || this.locked) return;
    this.locked = true;
    fn(opts);
  }

  private renderStats(units: Units): void {
    const landing = this.opts?.landing;
    if (!this.stats || !landing) return;
    const { stats } = landing;
    setChildren(this.stats,
      row("Hava süresi", formatSeconds(stats.airTime)),
      row("Maks. yükseklik", formatLength(stats.maxHeight, units)),
      row("Mesafe", formatLength(stats.distance, units, 0)),
      row("En yüksek hız", formatSpeed(stats.topSpeed, units)),
      this.opts?.level.id === "arcade" ? null : row(
        "İniş teması",
        `${formatSpeed(landing.impactSpeed, units)} · ${Math.round(landing.angleError / DEG)}°`
      )
    );
  }

  private countUp(el: HTMLElement, total: number): void {
    cancelAnimationFrame(this.raf);
    if (total <= 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = formatScore(total);
      return;
    }
    const start = performance.now() + 250;
    const duration = 900;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / duration));
      el.textContent = formatScore(total * (1 - (1 - k) ** 3));
      if (k < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}

export class PauseCard {
  readonly el: HTMLElement;
  private readonly eyebrow = h("div", { class: "rc-eyebrow" });
  private readonly card: HTMLElement;
  private readonly resume: HTMLButtonElement;
  private readonly restart: HTMLButtonElement;
  private readonly menu: HTMLButtonElement;
  private opts: PauseOptions | null = null;

  constructor(toggles: Toggles) {
    const titleId = `pause-title-${++idCounter}`;
    this.resume = button("Devam Et", ICONS.play, null, true);
    this.restart = button("Yeniden Başlat", ICONS.retry, null);
    this.menu = button("Ana Menü", ICONS.menu, null);
    onPress(this.resume, () => this.run((o) => o.onResume()));
    onPress(this.restart, () => this.run((o) => o.onRestart()));
    onPress(this.menu, () => this.run((o) => o.onMenu()));
    this.card = h(
      "div",
      { class: "hud-card pause-card" },
      this.eyebrow,
      h("h2", { class: "pause-title", id: titleId }, "Duraklatıldı"),
      h(
        "div",
        { class: "pause-actions" },
        this.resume,
        this.restart,
        this.menu
      ),
      h("div", { class: "pause-toggles" }, toggles.el)
    );
    this.el = h(
      "section",
      {
        class: "hud-pause hud-overlay",
        hidden: true,
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
      },
      this.card
    );
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(
    opts: PauseOptions,
    level: LevelDef | null,
    scheme: ControlScheme
  ): void {
    const wasVisible = this.visible;
    this.opts = opts;
    this.eyebrow.textContent = level?.id === "backflip" ? "Ters Takla · Eğik Rampa"
      : level?.id === "kickflip" ? "Yan Takla · Araç Dizilimi"
        : level ? `${level.title} · ${level.venue}` : "";
    this.setKey(this.resume, buttonKey(scheme, "resume"));
    this.setKey(this.restart, buttonKey(scheme, "restart"));
    this.el.hidden = false;
    if (!wasVisible) {
      replayClass(this.el, "is-entering");
      autofocus(this.resume, scheme);
    }
  }

  hide(): void {
    this.el.hidden = true;
    this.opts = null;
  }

  handle(action: "confirm" | "restart" | "back"): void {
    if (action === "confirm")
      activateFocused(this.card, () => this.run((o) => o.onResume()));
    else if (action === "restart") this.run((o) => o.onRestart());
    else this.run((o) => o.onResume());
  }

  private setKey(btn: HTMLButtonElement, key: string | null): void {
    btn.querySelector("kbd")?.remove();
    if (key) btn.append(keycap(key));
  }

  private run(fn: (opts: PauseOptions) => void): void {
    const opts = this.opts;
    if (!opts) return;
    this.opts = null;
    fn(opts);
  }
}
