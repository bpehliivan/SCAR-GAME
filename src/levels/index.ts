import { LEVEL_IDS, type LevelDef, type LevelId } from "@/core/types";
import { backflipLevel } from "./backflip";
import { kickflipLevel } from "./kickflip";

export const LEVELS: Record<LevelId, LevelDef> = {
  backflip: backflipLevel,
  kickflip: kickflipLevel,
  arcade: {
    ...backflipLevel,
    id: "arcade",
    title: "SONSUZ",
    venue: "GECE OTOYOLU",
    tagline: "Trafikten sıyrıl, rampalardan uç ve rekorunu kır.",
    spawnS: 500,
    spinAxis: "roll",
    speedHint: [17, 30],
    gasCapacity: 4,
    howTo: [
      "A/D ile yön değiştir. Havada Q sola yan takla, E sağa yan takla, X ters takla.",
      "Soğuk gaz yerde hız kazandırır, havada düşüşü yavaşlatır.",
      "Taklalar sırayla yapılır. Depoyu doldurmak için yerde iticileri bırak.",
    ],
    goal: { ...backflipLevel.goal, requireRampLaunch: false },
    camera: { airView: "chase", focusX: 0 },
  },
};

/** Menu and stunt-number order (see LEVEL_IDS). */
export const LEVEL_ORDER: LevelId[] = [...LEVEL_IDS];

export function getLevel(id: LevelId): LevelDef {
  return LEVELS[id];
}

export function nextLevel(id: LevelId): LevelId {
  const i = LEVEL_ORDER.indexOf(id);
  return LEVEL_ORDER[(i + 1) % LEVEL_ORDER.length];
}
