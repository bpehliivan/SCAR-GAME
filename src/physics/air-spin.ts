import { clamp, TAU } from "@/core/math";
import type { SpinAxis } from "@/core/types";
import { TUNING as T } from "./tuning";

export function uprightError(angle: number): number {
  return angle - TAU * Math.round(angle / TAU);
}

export class AirSpin {
  rate = 0;
  private held = false;
  private target = NaN;

  reset(): void {
    this.rate = 0;
    this.held = false;
    this.target = NaN;
  }

  step(input: number, angle: number, axis: SpinAxis, dt: number): number {
    let jet = 0;
    if (input !== 0) {
      const max = T.spinMaxRate[axis];
      this.rate = clamp(this.rate + input * T.spinAccel * dt, -max, max);
      jet = input * T.spinJetLevel;
      this.target = NaN;
    } else {
      if (this.held) {
        const judged = angle - this.rate * T.catchReaction;
        const error = uprightError(judged);
        this.target = Math.abs(error) <= T.catchWindow ? judged - error : NaN;
      }
      if (Number.isNaN(this.target)) {
        this.rate *= Math.exp(-T.spinDamping * dt);
      } else {
        const frequency = T.stabilizerFreq;
        const acceleration = clamp(
          -frequency * frequency * (angle - this.target) - 2 * frequency * this.rate,
          -T.stabilizerAccel,
          T.stabilizerAccel
        );
        this.rate += acceleration * dt;
        jet = (acceleration / T.stabilizerAccel) * T.assistJetLevel;
      }
    }
    this.held = input !== 0;
    return jet;
  }
}
