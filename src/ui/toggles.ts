import { dispatchAction } from "@/input/events";
import { h, icon, onPress } from "./dom";
import { ICONS } from "./icons";

export class Toggles {
  readonly el: HTMLElement;
  private readonly soundIcon = icon(ICONS.soundOn);
  private readonly soundText = h("span", { class: "tg-state" }, "AÇIK");
  private readonly soundBtn: HTMLButtonElement;

  constructor() {
    this.soundBtn = h(
      "button",
      {
        type: "button",
        class: "tg tg-sound",
        "aria-label": "Ses",
        "aria-pressed": "true",
      },
      this.soundIcon,
      h("span", null, "SES"),
      this.soundText
    );
    onPress(this.soundBtn, () => dispatchAction("mute"));
    this.el = h("div", { class: "tg-group" }, this.soundBtn);
  }

  sync(muted: boolean): void {
    this.soundBtn.setAttribute("aria-pressed", String(!muted));
    this.soundBtn.classList.toggle("is-off", muted);
    this.soundIcon.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    this.soundText.textContent = muted ? "KAPALI" : "AÇIK";

  }
}
