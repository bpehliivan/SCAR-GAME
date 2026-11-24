import type {
  CrashReason,
  LandingResult,
  LevelDef,
  Units,
} from "@/core/types";
import { DEG, lengthIn, speedIn } from "@/core/math";

export interface Attitude {
  pitch: number;
  roll: number;
}

export type ResultKind = "landed" | "short" | "wrecked";

export const SHORT_LINE = "Hedef mesafenin gerisine indin.";
export const SHORT_TIP =
  "Daha yüksek hızla rampaya gir veya havada iticileri kullanarak takla ve mesafe kazan.";

const TRICK_TRANSLATIONS: Record<string, string> = {
  BACKFLIP: "TERS TAKLA",
  "DOUBLE BACKFLIP": "ÇİFT TERS TAKLA",
  "TRIPLE BACKFLIP": "ÜÇLÜ TERS TAKLA",
  "QUAD BACKFLIP": "DÖRTLÜ TERS TAKLA",
  FRONTFLIP: "ÖNE TAKLA",
  "DOUBLE FRONTFLIP": "ÇİFT ÖNE TAKLA",
  "TRIPLE FRONTFLIP": "ÜÇLÜ ÖNE TAKLA",
  KICKFLIP: "YAN TAKLA",
  "DOUBLE KICKFLIP": "ÇİFT YAN TAKLA",
  "TRIPLE KICKFLIP": "ÜÇLÜ YAN TAKLA",
  "BARREL ROLL": "YAN DÖNÜŞÜ",
  "DOUBLE BARREL ROLL": "ÇİFT YAN DÖNÜŞÜ",
  "HALF BACKFLIP": "YARIM TERS TAKLA",
  "HALF FRONTFLIP": "YARIM ÖNE TAKLA",
  FLIP: "TAKLA",
};

export function localizeTrickName(rawName: string | undefined): string {
  if (!rawName) return "TAKLA";
  const cleaned = rawName.trim().toUpperCase();
  if (TRICK_TRANSLATIONS[cleaned]) return TRICK_TRANSLATIONS[cleaned];
  return cleaned
    .replace(/DOUBLE/g, "ÇİFT")
    .replace(/TRIPLE/g, "ÜÇLÜ")
    .replace(/QUAD/g, "DÖRTLÜ")
    .replace(/BACKFLIP/g, "TERS TAKLA")
    .replace(/FRONTFLIP/g, "ÖNE TAKLA")
    .replace(/KICKFLIP/g, "YAN TAKLA")
    .replace(/BARREL ROLL/g, "YAN DÖNÜŞÜ")
    .replace(/FLIP/g, "TAKLA");
}

function isClearedLanding(landing: LandingResult): boolean {
  const extended = landing as LandingResult & { cleared?: boolean };
  if (typeof extended.cleared === "boolean") return extended.cleared;
  return landing.score.total > 0;
}

export function resultKind(landing: LandingResult | null): ResultKind {
  if (!landing) return "wrecked";
  return isClearedLanding(landing) ? "landed" : "short";
}

export function stuntLabel(index1Based: number): string {
  return `PARKURLAR ${String(index1Based).padStart(2, "0")}`;
}

export function formatScore(score: number): string {
  return Math.round(score).toLocaleString("tr-TR");
}

export function formatBest(best: number | undefined): string {
  return best && best > 0 ? formatScore(best) : "—";
}

export function formatMultiplier(mult: number): string {
  return `${mult.toFixed(1)}×`;
}

export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)} sn`;
}

export function speedUnit(_units?: Units): string {
  return "KM/H";
}

export function lengthUnit(units: Units): string {
  return units === "imperial" ? "ft" : "m";
}

export function formatSpeed(mps: number, _units?: Units): string {
  return `${Math.round(speedIn(mps, "metric"))} km/h`;
}

export function formatSpeedRange(
  [lo, hi]: readonly [number, number],
  _units?: Units
): string {
  return `${Math.round(speedIn(lo, "metric"))}–${Math.round(speedIn(hi, "metric"))}`;
}

export function formatLength(
  meters: number,
  units: Units,
  decimals = 1
): string {
  return `${lengthIn(meters, units).toFixed(decimals)} ${lengthUnit(units)}`;
}

export function crashReasonLine(
  reason: CrashReason,
  obstacle: string | undefined,
  attitude: Attitude | null
): string {
  switch (reason) {
    case "angle": {
      if (!attitude) return "İnişte araç açısı dengesizdi.";
      const pitch = Math.abs(attitude.pitch);
      const roll = Math.abs(attitude.roll);
      if (Math.max(pitch, roll) > 115 * DEG) return "Tavan üstü yere çakıldın.";
      if (roll > pitch && roll > 40 * DEG) return "Yan tarafın üzerine indin.";
      if (attitude.pitch > 35 * DEG) return "Burun üstü yere çakıldın.";
      if (attitude.pitch < -35 * DEG) return "Arka tampon üstü sert indin.";
      return "İnişte araç açısı dengesizdi.";
    }
    case "impact":
      return "Yere çok sert çarptın.";
    case "obstacle":
      return obstacle
        ? `${obstacle} engeline çarptın.`
        : "Bir engele çarptın.";
    default:
      return "Kaza meydana geldi.";
  }
}

export function crashTip(
  reason: CrashReason,
  spinAxis: LevelDef["spinAxis"],
  obstacle?: string
): string {
  switch (reason) {
    case "angle":
      return spinAxis === "pitch"
        ? "İnişten önce tekerlekleri yere paralel hizalamak için taklayı zamanında bırak."
        : "İnişte tekerleklerin düz basması için dönüşü erken tamamla.";
    case "impact":
      return "Yere yaklaşırken düşüşü yumuşatmak için iticileri kullan.";
    case "obstacle":
      return obstacle
        ? `${obstacle} engelini aşmak için daha yüksek hız veya takla irtifası kazan.`
        : "Engellerin üzerinden aşmak için hız ve yükseklik kazan.";
    default:
      return "Hızını ve takla zamanlamanı ayarlayarak tekrar dene.";
  }
}

export function shareText(
  level: LevelDef,
  landing: LandingResult | null
): string {
  const kind = resultKind(landing);
  if (landing && kind === "landed") {
    const trTrick = localizeTrickName(landing.trick.name);
    return `SCAR — ${level.title} parkurunda ${trTrick} ile ${formatScore(landing.score.total)} puan kazandım!`;
  }
  return `SCAR — ${level.title} parkurunda sürüş denemesi!`;
}

export function sharePageUrl(
  canonical: string | undefined,
  loc: Pick<Location, "origin" | "pathname">
): string {
  return canonical || `${loc.origin}${loc.pathname}`;
}

export function shareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text, url });
  return `https://x.com/intent/tweet?${params.toString()}`;
}
