import { describe, expect, it } from "vitest";
import { crashReasonLine, formatBest, formatScore } from "../ui/format";

describe("ui/format", () => {
  it("formats scores and bests cleanly", () => {
    expect(formatScore(1234)).toBe("1.234");
    expect(formatBest(undefined)).toBe("—");
    expect(formatBest(0)).toBe("—");
    expect(formatBest(2500)).toBe("2.500");
  });

  it("formats crash reason lines with or without attitude", () => {
    expect(crashReasonLine("obstacle", "Semi", null)).toBe("Semi engeline çarptın.");
    expect(crashReasonLine("obstacle", "stage", null)).toBe("stage engeline çarptın.");
    expect(crashReasonLine("obstacle", undefined, null)).toBe("Bir araca çarptın.");
    expect(crashReasonLine("impact", undefined, null)).toBe("Yere çok sert çarptın.");
    expect(crashReasonLine("angle", undefined, null)).toBe("İnişte araç açısı dengesizdi.");
  });
});
