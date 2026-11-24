import { GAME_KEYS, readGameData, updateGameData } from "./local-save";

export const TUTORIAL_KEY = "scar.tutorial.v1";
export function needsTutorial(): boolean {
  try { return readGameData(TUTORIAL_KEY) !== "seen"; }
  catch { return true; }
}

export function exportProgress(): void {
  const progress = Object.fromEntries(GAME_KEYS.map((key) => [key, readGameData(key)]));
  const file = new Blob([JSON.stringify({ game: "SCAR Stunts", version: 1, progress }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "SCAR-kayit.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function decodeProgress(text: string): Record<string, string | null> {
  const save = JSON.parse(text);
  if (save?.game !== "SCAR Stunts" || save.version !== 1 || !save.progress ||
    typeof save.progress !== "object" || Array.isArray(save.progress)) {
    throw new Error("Geçersiz kayıt dosyası.");
  }
  return Object.fromEntries(GAME_KEYS.map((key) => {
    const raw = save.progress[key];
    if (raw === null) return [key, null];
    if (typeof raw !== "string" || raw.length > 16000) throw new Error("Geçersiz kayıt alanı.");
    if (key === TUTORIAL_KEY) {
      if (raw !== "seen") throw new Error("Geçersiz rehber kaydı.");
    } else {
      const record = JSON.parse(raw);
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Geçersiz kayıt alanı.");
    }
    return [key, raw];
  }));
}

export function resetProgress(): void {
  updateGameData(Object.fromEntries(GAME_KEYS.map((key) => [key, null])));
}
