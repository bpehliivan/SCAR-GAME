import type { SpinAxis } from "@/core/types";
import { countGamepads } from "@/input/mapping";

export type ControlScheme = "keyboard" | "touch" | "gamepad";
export type HintSegment = string | { key: string; icon?: "ccw" | "cw" };
export type HintId = "go" | "flipBack" | "roll" | "landSoft" | "liftOff";

export interface CheatRow {
  label: string;
  keys: HintSegment[];
}

export function detectScheme(isTouch: boolean): ControlScheme {
  if (isTouch) return "touch";
  return countGamepads() > 0 ? "gamepad" : "keyboard";
}

const CCW: HintSegment = { key: "◀", icon: "ccw" };
const CW: HintSegment = { key: "▶", icon: "cw" };

const NAMES: Record<
  ControlScheme,
  {
    gas: HintSegment;
    thrust: HintSegment;
    left: HintSegment;
    right: HintSegment;
  }
> = {
  keyboard: {
    gas: { key: "↑" },
    thrust: { key: "SPACE" },
    left: { key: "←" },
    right: { key: "→" },
  },
  touch: {
    gas: { key: "GAZ" },
    thrust: { key: "İTİCİ" },
    left: CCW,
    right: CW,
  },
  gamepad: {
    gas: { key: "RT" },
    thrust: { key: "A" },
    left: { key: "◀" },
    right: { key: "▶" },
  },
};

export function hintSegments(id: HintId, scheme: ControlScheme): HintSegment[] {
  const n = NAMES[scheme];
  switch (id) {
    case "go":
      return ["Başlamak için", n.gas, "tuşuna bas"];
    case "flipBack":
      return ["Geriye takla için", n.left, "tuşuna basılı tut"];
    case "roll":
      return ["Dönmek için", n.left, "veya", n.right, "basılı tut"];
    case "landSoft":
      return ["Yumuşak iniş için", n.thrust, "basılı tut"];
    case "liftOff":
      return ["Havalanmak için", n.thrust, "basılı tut"];
  }
}

export function cheatSheet(scheme: ControlScheme): CheatRow[] {
  switch (scheme) {
    case "keyboard":
      return [
        { label: "Gaz", keys: [{ key: "↑" }, { key: "W" }] },
        { label: "Fren · Geri", keys: [{ key: "↓" }, { key: "S" }] },
        { label: "Soğuk Gaz İtici", keys: [{ key: "SPACE" }] },
        {
          label: "Takla · Dönüş",
          keys: [{ key: "←" }, { key: "→" }, { key: "A" }, { key: "D" }],
        },
        { label: "Yeniden · Duraklat", keys: [{ key: "R" }, { key: "ESC" }] },
        {
          label: "Ses aç / kapat",
          keys: [{ key: "M" }],
        },
      ];
    case "touch":
      return [
        { label: "Gaz · Fren", keys: [{ key: "GAZ" }, { key: "FREN" }] },
        { label: "İticiler", keys: [{ key: "İTİCİ" }] },
        { label: "Takla · Dönüş", keys: [CCW, CW] },
        { label: "Duraklat · Yeniden", keys: [{ key: "❚❚" }] },
      ];
    case "gamepad":
      return [
        { label: "Gaz · Fren", keys: [{ key: "RT" }, { key: "LT" }] },
        { label: "İticiler", keys: [{ key: "A" }] },
        { label: "Takla · Dönüş", keys: [{ key: "L-STICK" }, { key: "D-PAD" }] },
        { label: "Yeniden · Duraklat", keys: [{ key: "Y" }, { key: "START" }] },
      ];
  }
}

export const SCHEME_LABEL: Record<ControlScheme, string> = {
  keyboard: "KLAVYE",
  touch: "DOKUNMATİK",
  gamepad: "OYUN KOLU",
};

export function buttonKey(
  scheme: ControlScheme,
  button: "retry" | "resume" | "restart" | "play"
): string | null {
  if (scheme === "touch") return null;
  const keyboard = { retry: "R", resume: "ESC", restart: "R", play: "ENTER" };
  const gamepad = { retry: "Y", resume: "START", restart: "Y", play: "A" };
  return (scheme === "keyboard" ? keyboard : gamepad)[button];
}

export function axisLabel(axis: SpinAxis): string {
  return axis === "pitch" ? "TAKLA" : "DÖNÜŞ";
}
