import { getLevel } from "@/levels";
import type { LevelDef, LevelId } from "@/core/types";
import type { GarageState, VehicleId } from "@/core/garage";
import { getVehiclePreset } from "@/core/garage";
import {
  SCHEME_LABEL,
  buttonKey,
  cheatSheet,
  type ControlScheme,
} from "./controls-info";
import { h, icon, keycap, replayClass, segmentNode } from "./dom";
import { formatBest, formatScore } from "./format";
import { ART_CURL, ART_LINEUP } from "./icons";
import type { Toggles } from "./toggles";

const ART: Partial<Record<LevelId, string>> = {
  backflip: ART_CURL,
  kickflip: ART_LINEUP,
};

const LEVEL_TR: Record<string, { title: string; venue: string; tagline: string }> = {
  backflip: {
    title: "TERS TAKLA",
    venue: "EĞİK RAMPA",
    tagline: "Rampadan fırlayıp geriye takla at, puan ve S Point kazan.",
  },
  kickflip: {
    title: "YAN TAKLA",
    venue: "ARAÇ DİZİLİMİ",
    tagline: "İticilerle havalan ve engellerin üzerinden dönerek atla.",
  },
  arcade: {
    title: "SONSUZ",
    venue: "DİNAMİK PİST",
    tagline: "Rampalardan uç, S Point topla ve yeni araçların kilidini aç.",
  },
};

export interface MenuShowArgs {
  levels: LevelDef[];
  best: Partial<Record<LevelId, number>>;
  garage: GarageState;
  scheme: ControlScheme;
  onPlay(id: LevelId): void;
  onOpenGarage(): void;
  autofocus: boolean;
}

export class MenuView {
  readonly el: HTMLElement;
  private readonly garageSummary: HTMLElement;
  private readonly cards = h("div", { class: "menu-cards" });
  private readonly sheet = h("aside", {
    class: "menu-sheet hud-glass",
    "aria-label": "Kontroller",
  });
  private levels: LevelDef[] = [];
  private scheme: ControlScheme = "keyboard";
  private onPlay: ((id: LevelId) => void) | null = null;
  private onOpenGarage: (() => void) | null = null;

  constructor(toggles: Toggles) {
    const openGarageBtn = h(
      "button",
      {
        type: "button",
        class: "hud-btn hud-btn--primary garage-open-btn",
        "data-open-garage": "1",
      },
      "Garajı aç"
    );

    this.garageSummary = h(
      "div",
      { class: "garage-summary-box" },
      h("span", { class: "hud-label" }, "GARAJ"),
      h("strong", { class: "garage-active-name" }, ""),
      h("span", { class: "garage-wallet-chip" }, "")
    );

    const garageCard = h(
      "div",
      { class: "menu-garage-bar hud-glass" },
      this.garageSummary,
      openGarageBtn
    );

    this.el = h(
      "section",
      { class: "hud-menu", hidden: true, "aria-label": "Ana Menü" },
      h(
        "div",
        { class: "menu-brand" },
        h("h1", { class: "wordmark", "aria-label": "SCAR" }, "SCAR"),
        h("p", { class: "menu-sub" }, "Akrobasi ve sonsuz sürüş"),
        h("button", { type: "button", class: "hud-btn hud-btn--primary hero-play", "aria-label": "Sonsuz sürüşe çık" }, "Sürüşe çık")
      ),
      toggles.el,
      garageCard,
      h("div", { class: "menu-main" }, this.cards),
      h(
        "footer",
        { class: "menu-foot" },
        this.sheet,
        h(
          "div",
          { class: "dev-credit" },
          h("span", { class: "dev-title" }, "Proje ortakları"),
          h("strong", { class: "dev-names" }, "Burak Pehlivan, Mehmet Erdoğan")
        )
      )
    );

    this.el.querySelector(".hero-play")?.addEventListener("click", () => this.play("arcade"));
    openGarageBtn.addEventListener("click", () => {
      this.onOpenGarage?.();
    });

    this.cards.addEventListener("click", this.onCardsClick);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(args: MenuShowArgs): void {
    const refresh = this.visible;
    this.levels = args.levels;
    this.onPlay = args.onPlay;
    this.onOpenGarage = args.onOpenGarage;
    this.renderGarageSummary(args.garage);
    this.renderCards(args.levels, args.best, args.scheme);
    this.renderSheet(args.scheme);
    this.el.dataset.scheme = args.scheme;
    this.el.hidden = false;
    if (!refresh) {
      replayClass(this.el, "is-entering");
      if (args.autofocus) this.firstPlay()?.focus({ preventScroll: true });
    }
  }

  updateGarage(garage: GarageState): void {
    this.renderGarageSummary(garage);
  }

  hide(): void {
    this.el.hidden = true;
    this.onPlay = null;
    this.onOpenGarage = null;
  }

  setScheme(scheme: ControlScheme): void {
    if (!this.visible || scheme === this.scheme) return;
    this.renderSheet(scheme);
    const playKey = buttonKey(scheme, "play");
    for (const key of this.cards.querySelectorAll<HTMLElement>(".card-key")) {
      key.textContent = playKey;
    }
    this.el.dataset.scheme = scheme;
  }

  playFocusedOrFirst(): void {
    const focused = document.activeElement;
    const id =
      focused instanceof HTMLElement && this.cards.contains(focused)
        ? focused.dataset.level
        : undefined;
    this.play(this.levels.find((l) => l.id === id)?.id ?? "arcade");
  }

  private play(id: LevelId): void {
    const onPlay = this.onPlay;
    if (!onPlay) return;
    this.onPlay = null;
    onPlay(id);
  }

  private firstPlay(): HTMLButtonElement | null {
    return this.el.querySelector<HTMLButtonElement>(".hero-play");
  }

  private readonly onCardsClick = (e: MouseEvent): void => {
    const target = e.target instanceof Element ? e.target : null;
    const card = target?.closest<HTMLElement>("[data-level]");
    const id = card?.dataset.level as LevelId | undefined;
    if (id) this.play(id);
  };

  private renderGarageSummary(garage: GarageState): void {
    const preset = getVehiclePreset(garage.selectedId as VehicleId);
    const colorHex = garage.colors[preset.id] ?? preset.defaultColor;
    this.garageSummary.replaceChildren(
      h("span", { class: "hud-label" }, "SEÇİLİ ARAÇ"),
      h(
        "div",
        { class: "garage-active-row" },
        h("span", {
          class: "garage-car-dot",
          style: `background:${colorHex}`,
        }),
        h("strong", { class: "garage-active-name" }, preset.name)
      ),
      h("span", { class: "garage-wallet-chip" }, `BAKİYE: ${formatScore(garage.wallet)} SP`)
    );
  }

  private renderCards(
    levels: LevelDef[],
    best: Partial<Record<LevelId, number>>,
    scheme: ControlScheme
  ): void {
    const playKey = buttonKey(scheme, "play");
    const list: Array<{ def: LevelDef; badge: string }> = [
      ...levels.map((def) => ({ def, badge: "" })),
    ];
    if (!list.some((item) => String(item.def.id) === "arcade")) {
      const base = levels[0];
      if (base) {
        list.push({
          def: getLevel("arcade"),
          badge: "SERBEST SÜRÜŞ",
        });
      }
    }

    this.cards.replaceChildren(
      ...list.map(({ def, badge }, index) => {
        const score = best[def.id];
        const art = ART[def.id];
        const tr = LEVEL_TR[String(def.id)];
        const title = tr?.title ?? def.title;
        const venue = tr?.venue ?? def.venue;
        const tagline = tr?.tagline ?? def.tagline;

        const play = h(
          "button",
          {
            type: "button",
            class: "hud-btn hud-btn--primary card-play",
            "data-level": def.id,
            "aria-label": `${title} oyna`,
          },
          h("span", null, "OYNA"),
          playKey ? keycap(playKey, "hud-key card-key") : null
        );

        return h(
          "article",
          {
            class: "stunt-card hud-glass",
            "data-level": def.id,
            style: `--i:${index}`,
          },
          h(
            "div",
            { class: "card-head" },
            h(
              "div",
              { class: "card-eyebrow" },
              badge ? h("span", { class: "card-index" }, badge) : null,
              h("span", { class: "card-venue" }, venue)
            ),
            art ? icon(art, "card-art") : null
          ),
          h("h2", { class: "card-title" }, title),
          h("p", { class: "card-tagline" }, tagline),
          h(
            "div",
            { class: "card-foot" },
            h(
              "div",
              { class: "card-best" },
              h("span", { class: "hud-label" }, "REKOR"),
              h(
                "span",
                { class: `card-best-val${score ? "" : " is-empty"}` },
                formatBest(score)
              )
            ),
            play
          )
        );
      })
    );
  }

  private renderSheet(scheme: ControlScheme): void {
    this.scheme = scheme;
    const rows = cheatSheet(scheme);
    const previous = this.sheet.querySelector("details");
    const open = previous
      ? previous.open
      : false;
    this.sheet.replaceChildren(
      h(
        "details",
        { class: "sheet-fold", open },
        h(
          "summary",
          { class: "sheet-head" },
          h("span", { class: "hud-label" }, "KONTROLLER"),
          h("span", { class: "sheet-scheme" }, SCHEME_LABEL[scheme])
        ),
        h(
          "dl",
          { class: "sheet-rows" },
          ...rows.map((row) =>
            h(
              "div",
              { class: "sheet-row" },
              h("dt", null, row.label),
              h("dd", null, ...row.keys.map(segmentNode))
            )
          )
        )
      )
    );
  }
}
