
import { readGameData, writeGameData } from "./local-save";

export const DEFAULT_PLATE = "34 PHLVN 55";

export const THEMES = {
  night: { name: "Gece Şehri", sky: ["#101631", "#253b67", "#875076"], ground: "#283743", fog: "#2a405b", accent: "#a7627b", light: "#c2d8ff", sun: 0.72, ambient: 1.15 },
  day: { name: "Gündüz Şehri", sky: ["#426b98", "#76a6c2", "#c7d6da"], ground: "#586877", fog: "#8aabb7", accent: "#8a6980", light: "#fff0de", sun: 1.1, ambient: 1.25 },
  coast: { name: "Sahil Akşamı", sky: ["#294e70", "#6e91a1", "#e2ac86"], ground: "#657674", fog: "#9b9ba5", accent: "#ae806f", light: "#ffdab8", sun: 0.9, ambient: 1.17 },
  highland: { name: "Dağ Geçidi", sky: ["#3d607d", "#7897a8", "#b0bcb4"], ground: "#5c6955", fog: "#788c8e", accent: "#a18e70", light: "#e4edf5", sun: 1.03, ambient: 1.2 },
} as const;

export type ThemeId = keyof typeof THEMES;

export interface DriverProfile {
  plate: string;
  theme: ThemeId;
}

const STORAGE_KEY = "scar.driver.v1";

export function normalizePlate(value: string): string {
  return value.trim().toUpperCase()
    .replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/İ/g, "I")
    .replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U")
    .replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").slice(0, 12).trim();
}

export function loadDriverProfile(): DriverProfile | null {
  try {
    const raw = JSON.parse(readGameData(STORAGE_KEY) ?? "null");
    if (!raw || typeof raw.plate !== "string" || !normalizePlate(raw.plate)) return null;
    return {
      plate: normalizePlate(raw.plate),
      theme: Object.hasOwn(THEMES, raw.theme) ? raw.theme as ThemeId : "night",
    };
  } catch {
    return null;
  }
}

export function saveDriverProfile(profile: DriverProfile): void {
  try {
    writeGameData(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Keep the current session's profile when local storage is unavailable.
  }
}
