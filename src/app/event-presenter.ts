import type { LandingResult, PhysicsEvent } from "@/core/types";
import type { AudioEngine } from "@/audio/audio-engine";
import type { CameraRig } from "@/render/camera-rig";
import type { FxSystem } from "@/render/fx";
import type { Hud } from "@/ui/hud";
import { localizeTrickName } from "@/ui/format";
import { stuntCashReward } from "@/core/garage";

export interface Presenters {
  hud: Hud;
  fx: FxSystem;
  audio: AudioEngine;
  camera: CameraRig;
  onEarnCash?(amount: number): void;
}

function hasCleared(result: LandingResult): boolean {
  const extended = result as LandingResult & { cleared?: boolean };
  if (typeof extended.cleared === "boolean") return extended.cleared;
  return result.score.total > 0;
}

export function presentEvent(
  e: PhysicsEvent,
  p: Presenters,
  demo: boolean
): void {
  const fxAny = p.fx as unknown as Record<
    string,
    ((...args: unknown[]) => void) | undefined
  >;

  switch (e.type) {
    case "rampEnter":
    case "launch":
    case "thrustStart":
    case "thrustStop":
    case "settled":
      break;

    case "impact":
      fxAny.onImpact?.(e.position, e.intensity);
      fxAny.impact?.(e.position, e.intensity);
      if (!demo) {
        p.audio.play("impact", e.intensity);
        p.camera.shake(0.16 * Math.min(1.5, Math.max(0.25, e.intensity)));
      }
      break;

    case "flip":
      if (!demo) {
        const deg = Math.round(e.turns * 360);
        const reward = stuntCashReward(e.turns, e.axis === "pitch");
        p.onEarnCash?.(reward);
        p.hud.popup(`${deg}° TAKLA · +${reward} SP`, "info");
        p.audio.play("flip");
      }
      break;

    case "land": {
      const grade = e.result.grade;
      const cleared = hasCleared(e.result);
      const gain = grade === "perfect" ? 1 : grade === "great" ? 0.8 : 0.6;

      fxAny.onLanding?.(e.position, grade);
      fxAny.land?.(e.position, grade);

      if (!demo) {
        p.audio.play("land", gain);
        p.camera.shake(
          grade === "perfect" ? 0.14 : grade === "great" ? 0.24 : 0.36
        );
        if (cleared) {
          const trName = localizeTrickName(e.result.trick.name);
          const bonus =
            grade === "perfect" ? 250 : grade === "great" ? 120 : 60;
          p.onEarnCash?.(bonus);
          p.hud.popup(`${trName} · +${bonus} SP`, "trick");
          if (grade === "perfect") {
            p.hud.popup("MÜKEMMEL İNİŞ", "perfect");
          }
        } else {
          p.hud.popup("KISA KALDI", "warn");
        }
      }
      break;
    }

    case "crash":
      fxAny.onCrash?.(e.position, e.impact);
      fxAny.crash?.(e.position, e.impact);
      if (!demo) {
        p.audio.play("crash");
        p.camera.shake(0.95);
        p.hud.popup("KAZA YAPILDI", "warn");
      }
      break;

    case "gasEmpty":
      if (!demo) p.hud.popup("YAKIT BİTTİ", "warn");
      break;
  }
}
