
import { normalizePlate, THEMES, type DriverProfile, type ThemeId } from "@/core/driver-profile";
import { updateGameData, writeGameData } from "@/core/local-save";
import { decodeProgress, exportProgress, resetProgress, TUTORIAL_KEY } from "@/core/save-transfer";
import { h } from "./dom";

export class DriverSetup {
  readonly button = h("button", { type: "button", class: "hud-btn driver-open" }, "Ayarlar");
  private readonly dialog = h("dialog", { class: "driver-dialog hud-card", "aria-labelledby": "driver-dialog-title" });
  private readonly plate = h("input", { type: "text", id: "driver-plate", maxlength: "12", required: true, autocomplete: "off", spellcheck: "false" });
  private readonly theme = h("select", { id: "driver-theme" });
  private readonly tutorial = h("dialog", { class: "driver-dialog hud-card", "aria-labelledby": "tutorial-title" });
  private firstVisit = false;
  private tutorialPage = 0;
  private profile: DriverProfile;
  private setupOnClose = false;

  constructor(
    root: HTMLElement,
    profile: DriverProfile,
    private readonly onSave: (profile: DriverProfile) => void,
    onProgressChanged: () => void,
  ) {
    this.profile = profile;
    for (const [id, theme] of Object.entries(THEMES)) {
      this.theme.append(h("option", { value: id }, theme.name));
    }
    const close = h("button", { type: "button", class: "hud-btn" }, "Kapat");
    const submit = h("button", { type: "submit", class: "hud-btn hud-btn--primary" }, "Kaydet");
    const form = h("form", null,
      h("h2", { id: "driver-dialog-title" }, "Sürücü ayarları"),
      h("label", { for: "driver-plate" }, "Plakan"),
      this.plate,
      h("p", { class: "driver-help" }, "En fazla 12 karakter. Harf, rakam ve boşluk kullan."),
      h("label", { for: "driver-theme" }, "Pist teması"),
      this.theme,
      h("div", { class: "driver-actions" }, close, submit),
    );
    const status = h("p", { class: "driver-help", role: "status" });
    const exportButton = h("button", { type: "button", class: "hud-btn" }, "Kaydı dışa aktar");
    const importButton = h("button", { type: "button", class: "hud-btn" }, "Kaydı içe aktar");
    const resetButton = h("button", { type: "button", class: "hud-btn" }, "Oyunu sıfırla");
    const guideButton = h("button", { type: "button", class: "hud-btn" }, "Sürüş rehberi");
    const file = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    exportButton.addEventListener("click", () => {
      try { exportProgress(); status.textContent = "Kayıt dosyası hazırlandı."; }
      catch { status.textContent = "Kayıt dosyası oluşturulamadı."; }
    });
    importButton.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const selected = file.files?.[0];
      file.value = "";
      if (!selected) return;
      try {
        if (selected.size > 128000) throw new Error("File too large");
        const progress = decodeProgress(await selected.text());
        if (!window.confirm("Bu dosya mevcut ilerlemenin yerini alacak. Devam edilsin mi?")) return;
        updateGameData(progress);
        this.dialog.close();
        onProgressChanged();
      } catch {
        status.textContent = "Kayıt yüklenemedi. SCAR'dan dışa aktarılan JSON dosyasını seç.";
      }
    });
    resetButton.addEventListener("click", () => {
      if (!window.confirm("SP, araçlar, rekorlar ve sürücü ayarları silinecek. Oyun sıfırlansın mı?")) return;
      try {
        resetProgress();
        this.dialog.close();
        onProgressChanged();
      }
      catch { status.textContent = "İlerleme sıfırlanamadı."; }
    });
    guideButton.addEventListener("click", () => this.openTutorial(false));
    this.dialog.append(form, h("section", { class: "driver-progress" },
      h("h3", null, "İlerleme"),
      h("p", { class: "driver-help" }, "SP, araçlar ve rekorlar otomatik kaydedilir. Kaydı başka bilgisayara taşımak için dışa aktar."),
      h("div", { class: "driver-save-actions" }, exportButton, importButton, resetButton, guideButton),
      file, status,
    ));
    root.append(this.dialog, this.tutorial);
    this.tutorial.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.finishTutorial();
    });
    for (const event of ["keydown", "keyup"]) this.tutorial.addEventListener(event, (e) => e.stopPropagation());
    this.button.addEventListener("click", () => this.open());
    close.addEventListener("click", () => this.dialog.close());
    for (const event of ["keydown", "keyup"]) this.dialog.addEventListener(event, (e) => e.stopPropagation());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const plate = normalizePlate(this.plate.value);
      if (!plate) {
        this.plate.setCustomValidity("En az bir harf veya rakam gir.");
        this.plate.reportValidity();
        return;
      }
      this.profile = { plate, theme: this.theme.value as ThemeId };
      this.setupOnClose = false;
      this.onSave(this.profile);
      this.dialog.close();
    });
    this.plate.addEventListener("input", () => this.plate.setCustomValidity(""));
    this.dialog.addEventListener("close", () => {
      if (this.setupOnClose) this.onSave(this.profile);
      this.setupOnClose = false;
      if (!this.visible) this.button.focus();
    });
  }

  get visible(): boolean { return this.dialog.open || this.tutorial.open; }

  openTutorial(firstVisit: boolean): void {
    this.firstVisit = firstVisit;
    this.tutorialPage = 0;
    this.renderTutorial();
    this.tutorial.showModal();
  }

  private finishTutorial(): void {
    try { writeGameData(TUTORIAL_KEY, "seen"); }
    catch { /* The guide can still be dismissed when storage is unavailable. */ }
    this.tutorial.close();
    if (this.firstVisit) this.open(true);
  }

  private renderTutorial(): void {
    const pages = [
      ["Gaz ve fren", "W veya ↑ ile hızlan, S veya ↓ ile frenle. Sonsuz modda A ve D ya da yön tuşlarıyla şerit değiştir."],
      ["Rampa ve takla", "Boşluk ile soğuk gazı kullan. Sonsuz modda rampadan havalanınca Q ile sola, E ile sağa yan takla ve X ile ters takla at."],
      ["S Point ve garaj", "Jetonlar ve başarılı hareketler SP kazandırır. Garajda yeni araç alabilir, boyasını ücretsiz değiştirebilirsin. M sesi, Esc duraklatmayı kontrol eder."],
    ];
    const [title, description] = pages[this.tutorialPage];
    const last = this.tutorialPage === pages.length - 1;
    const skip = h("button", { type: "button", class: "hud-btn" }, last ? "Kapat" : "Atla");
    skip.addEventListener("click", () => this.finishTutorial());
    const next = h("button", { type: "button", class: "hud-btn hud-btn--primary" }, last ? "Tamamla" : "Sonraki");
    next.addEventListener("click", () => {
      if (last) this.finishTutorial();
      else { this.tutorialPage++; this.renderTutorial(); }
    });
    this.tutorial.replaceChildren(
      h("p", { class: "driver-help" }, `Sürüş rehberi · ${this.tutorialPage + 1}/${pages.length}`),
      h("h2", { id: "tutorial-title" }, title),
      h("p", { class: "driver-tutorial-copy" }, description),
      h("div", { class: "driver-actions" }, skip, next),
    );
    if (this.tutorial.open) next.focus();
  }

  setProfile(profile: DriverProfile): void {
    this.profile = profile;
  }

  open(setup = false): void {
    this.setupOnClose = setup;
    this.plate.setCustomValidity("");
    this.plate.value = this.profile.plate;
    this.theme.value = this.profile.theme;
    this.dialog.showModal();
    this.plate.select();
  }
}
