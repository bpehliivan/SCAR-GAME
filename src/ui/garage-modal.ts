import {
  GARAGE_COLORS,
  VEHICLE_CATALOG,
  type GarageState,
  type VehicleId,
} from "@/core/garage";
import { h } from "./dom";
import { requestVehiclePreview } from "./vehicle-preview";
import { formatScore } from "./format";

export interface GarageModalCallbacks {
  onSelectVehicle(id: VehicleId): void;
  onBuyVehicle(id: VehicleId): void;
  onSelectColor(colorHex: string): void;
  onClose(): void;
}

export class GarageModal {
  readonly el: HTMLElement;
  private readonly walletEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly paletteEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly navigation = h("nav", { class: "garage-pages", "aria-label": "Garaj sayfaları" });
  private readonly activeName = h("strong", { class: "garage-selected-name" });
  private page = 0;
  private readonly pageSize = 6;
  private callbacks: GarageModalCallbacks | null = null;
  private state: GarageState | null = null;

  constructor() {
    this.walletEl = h("span", { class: "garage-wallet-val" }, "0");
    this.listEl = h("div", { class: "garage-vehicles" });
    this.paletteEl = h("div", { class: "garage-colors" });
    this.statusEl = h("p", { class: "garage-status" }, "");

    const closeBtn = h(
      "button",
      {
        type: "button",
        class: "hud-btn hud-btn--primary garage-close",
        "aria-label": "Garajı Kapat",
      },
      "Menüye dön"
    );

    const panel = h(
      "div",
      {
        class: "garage-panel hud-card",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Garaj ve Araç Mağazası",
      },
      h(
        "div",
        { class: "garage-head" },
        h(
          "div",
          null,
          h("h2", { class: "garage-title" }, "Garaj")
        ),
        h(
          "div",
          { class: "garage-wallet" },
          h("span", { class: "hud-label" }, "S Point bakiyesi"),
          this.walletEl
        )
      ),
      this.listEl,
      this.navigation,
      h(
        "div",
        { class: "garage-color-box" },
        h("div", { class: "garage-color-heading" }, h("span", { class: "hud-label" }, "Boya"), this.activeName),
        this.paletteEl
      ),
      h(
        "div",
        { class: "garage-foot" },
        this.statusEl,
        closeBtn
      )
    );

    this.el = h(
      "div",
      { class: "garage-backdrop", hidden: true },
      panel
    );

    closeBtn.addEventListener("click", () => {
      this.callbacks?.onClose();
      this.hide();
    });

    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) {
        this.callbacks?.onClose();
        this.hide();
      }
    });

    this.listEl.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const btn = target?.closest<HTMLButtonElement>("[data-action][data-car]");
      if (!btn || !this.state) return;
      const id = btn.dataset.car as VehicleId;
      const action = btn.dataset.action;
      if (action === "buy") {
        this.callbacks?.onBuyVehicle(id);
      } else if (action === "select") {
        this.callbacks?.onSelectVehicle(id);
      }
    });

    this.paletteEl.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const swatch = target?.closest<HTMLButtonElement>("[data-color]");
      if (!swatch?.dataset.color) return;
      this.callbacks?.onSelectColor(swatch.dataset.color);
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  open(state: GarageState, callbacks: GarageModalCallbacks): void {
    this.state = state;
    this.callbacks = callbacks;
    const sorted = [...VEHICLE_CATALOG].sort((a, b) => a.price - b.price);
    this.page = Math.max(0, Math.floor(sorted.findIndex((car) => car.id === state.selectedId) / this.pageSize));
    this.render();
    this.el.hidden = false;
  }

  sync(state: GarageState): void {
    this.state = state;
    if (!this.el.hidden) {
      this.render();
    }
  }

  hide(): void {
    this.el.hidden = true;
    this.callbacks = null;
  }

  private render(): void {
    const st = this.state;
    if (!st) return;

    this.walletEl.textContent = `${formatScore(st.wallet)} SP`;
    const ownedSet = new Set(st.ownedIds);
    const activePreset =
      VEHICLE_CATALOG.find((v) => v.id === st.selectedId) ?? VEHICLE_CATALOG[0];
    const activeColor = st.colors[activePreset.id] ?? activePreset.defaultColor;
    this.activeName.textContent = activePreset.name;
    const sorted = [...VEHICLE_CATALOG].sort((a, b) => a.price - b.price);
    const pages = Math.ceil(sorted.length / this.pageSize);
    this.navigation.replaceChildren(...Array.from({ length: pages }, (_, index) => {
      const button = h("button", {
        type: "button", class: "hud-btn", "aria-current": index === this.page ? "page" : null,
      }, String(index + 1));
      button.addEventListener("click", () => {
        this.page = index;
        this.render();
        this.navigation.querySelectorAll("button")[index]?.focus();
      });
      return button;
    }));

    this.listEl.replaceChildren(
      ...sorted.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize).map((car) => {
        const owned = ownedSet.has(car.id);
        const selected = st.selectedId === car.id;
        const canAfford = st.wallet >= car.price;
        const carColor = st.colors[car.id] ?? car.defaultColor;
        const preview = h("img", { class: "garage-preview", alt: "", decoding: "async", width: 460, height: 230 });
        const previewBody = h("div", {
          class: "garage-preview-body",
          style: `--paint: ${carColor}; --vehicle-accent: ${car.accentColor}`,
        }, preview);
        void requestVehiclePreview(car.id, carColor).then((source) => {
          if (!preview.isConnected) return;
          preview.src = source;
          previewBody.classList.add("has-preview");
        }).catch(() => {
          if (previewBody.isConnected) previewBody.classList.add("preview-unavailable");
        });

        const actionBtn = owned
          ? h(
              "button",
              {
                type: "button",
                class: `hud-btn garage-action-btn${selected ? " is-selected" : ""}`,
                "data-action": "select",
                "data-car": car.id,
              },
              selected ? "Sürüşe hazır" : "Seç"
            )
          : h(
              "button",
              {
                type: "button",
                class: `hud-btn hud-btn--primary garage-action-btn${canAfford ? "" : " is-disabled"}`,
                "data-action": "buy",
                "data-car": car.id,
              },
              canAfford ? `Satın al · ${formatScore(car.price)} SP` : `${formatScore(car.price)} SP`
            );

        return h(
          "div",
          {
            class: `garage-car-row${selected ? " is-selected" : ""}${owned ? " is-owned" : " is-locked"}`,
          },
          previewBody,
          h("div", { class: "garage-car-info" },
            h("div", { class: "garage-car-top" },
              h("span", { class: "garage-car-cat" }, car.category),
              owned ? h("span", { class: "garage-car-badge" }, selected ? "Aktif" : "Sende") : null
            ),
            h("strong", { class: "garage-car-name" }, car.name),
            h("div", { class: "garage-car-metrics" },
              ...Object.entries({ Hız: car.stats.speed, Takla: car.stats.spin, Kontrol: car.stats.control }).map(([label, value]) =>
                h("span", null, label, h("b", null, value))
              )
            ),
            actionBtn
          )
        );
      })
    );

    this.paletteEl.replaceChildren(
      ...GARAGE_COLORS.map((c) => {
        const isOn = activeColor.toLowerCase() === c.hex.toLowerCase();
        return h(
          "button",
          {
            type: "button",
            class: `garage-swatch${isOn ? " is-on" : ""}`,
            "data-color": c.hex,
            title: c.label,
            "aria-label": c.label,
            style: `--swatch:${c.hex}`,
          },
          h("span", { class: "garage-swatch-chip" }),
          h("span", { class: "garage-swatch-label" }, c.label)
        );
      })
    );

    this.statusEl.textContent = "Boya ücretsiz. Sonsuz sürüşte S Point kazan.";
  }
}
