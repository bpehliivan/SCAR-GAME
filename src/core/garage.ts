import { readGameData, writeGameData } from "./local-save";
import type { LevelId } from "./types";

export type VehicleId =
  | "bmw_7_series"
  | "tesla_roadster"
  | "renault_clio_iv"
  | "ferrari_599"
  | "mercedes_truck"
  | "audi_a7"
  | "amg_gt"
  | "cyberbeast"
  | "police_usa"
  | "xiaomi_yu7"
  | "porsche_911";

export interface VehiclePreset {
  id: VehicleId;
  name: string;
  category: string;
  price: number;
  defaultColor: string;
  accentColor: string;
  tagline: string;
  wheelRadius: number;
  bodyScale: [number, number, number];
  stats: {
    speed: number;
    spin: number;
    control: number;
  };
}

export interface GarageColorSwatch {
  id: string;
  label: string;
  hex: string;
}

export const GARAGE_COLORS: readonly GarageColorSwatch[] = [
  { id: "bmw_silver", label: "Gümüş", hex: "#9aa3ad" },
  { id: "roadster_red", label: "Kırmızı", hex: "#bf182a" },
  { id: "midnight", label: "Gece Mavisi", hex: "#162b56" },
  { id: "pearl", label: "Pastel Beyaz", hex: "#dddcd7" },
  { id: "black", label: "Siyah", hex: "#16191e" },
];

export const VEHICLE_CATALOG: readonly VehiclePreset[] = [
  {
    id: "tesla_roadster",
    name: "TESLA ROADSTER",
    category: "ELEKTRİKLİ SPOR",
    price: 5800,
    defaultColor: "#bf182a",
    accentColor: "#ff5364",
    tagline: "Alçak ve aerodinamik Roadster; özel 3D kaporta, farlar ve jantlar.",
    wheelRadius: 0.35,
    bodyScale: [1, 1, 1],
    stats: { speed: 99, spin: 92, control: 91 },
  },
  {
    id: "bmw_7_series",
    name: "BMW 7 SERİSİ",
    category: "LÜKS SEDAN",
    price: 1350,
    defaultColor: "#9aa3ad",
    accentColor: "#60a5fa",
    tagline:
      "Detaylı kabin, çift böbrek panjur ve hareketli çok kollu jantlar.",
    wheelRadius: 0.36,
    bodyScale: [1.14, 0.96, 1.05],
    stats: { speed: 92, spin: 88, control: 94 },
  },
  {
    id: "renault_clio_iv",
    name: "RENAULT CLIO IV",
    category: "HATCHBACK",
    price: 0,
    defaultColor: "#d83442",
    accentColor: "#ff7b75",
    tagline: "Kompakt gövde, ayrı kabin ve hareketli jantlar.",
    wheelRadius: 0.32,
    bodyScale: [1, 1, 1],
    stats: { speed: 77, spin: 91, control: 95 },
  },
  {
    id: "ferrari_599",
    name: "FERRARI 599 GTB",
    category: "GRAND TOURER",
    price: 6300,
    defaultColor: "#bf182a",
    accentColor: "#ff6b72",
    tagline: "Uzun kaput, ayrı stop lambaları ve ayrıntılı jantlar.",
    wheelRadius: 0.36,
    bodyScale: [1, 1, 1],
    stats: { speed: 98, spin: 89, control: 91 },
  },
  {
    id: "mercedes_truck",
    name: "MERCEDES-BENZ KAMYON",
    category: "AĞIR VASITA",
    price: 1650,
    defaultColor: "#85364d",
    accentColor: "#e18b9c",
    tagline: "Yüksek kabin, geniş ızgara ve üç akslı şasi.",
    wheelRadius: 0.48,
    bodyScale: [1, 1, 1],
    stats: { speed: 63, spin: 65, control: 78 },
  },
  {
    id: "audi_a7",
    name: "AUDI A7 2015",
    category: "SPORTBACK",
    price: 1800,
    defaultColor: "#536c85",
    accentColor: "#8dcbff",
    tagline: "Uzun aks mesafeli sportback ve hareketli jantlar.",
    wheelRadius: 0.34,
    bodyScale: [1, 1, 1],
    stats: { speed: 92, spin: 86, control: 91 },
  },
  {
    id: "amg_gt",
    name: "MERCEDES-AMG GT",
    category: "SPOR COUPÉ",
    price: 3950,
    defaultColor: "#bb913a",
    accentColor: "#ffcd65",
    tagline: "Uzun kaputlu, iki kapılı spor otomobil.",
    wheelRadius: 0.35,
    bodyScale: [1, 1, 1],
    stats: { speed: 97, spin: 93, control: 90 },
  },
  {
    id: "cyberbeast",
    name: "TESLA CYBERTRUCK CYBERBEAST",
    category: "ELEKTRİKLİ PICK-UP",
    price: 4700,
    defaultColor: "#999fa6",
    accentColor: "#77d6ee",
    tagline: "Elektrikli pick-up ve boyanabilir paslanmaz çelik paneller.",
    wheelRadius: 0.44,
    bodyScale: [1, 1, 1],
    stats: { speed: 89, spin: 79, control: 86 },
  },
  {
    id: "police_usa",
    name: "POLICE USA",
    category: "DEVRİYE SEDANI",
    price: 850,
    defaultColor: "#26344d",
    accentColor: "#579cff",
    tagline: "Tavan ışık barlı Amerikan devriye sedanı.",
    wheelRadius: 0.37,
    bodyScale: [1, 1, 1],
    stats: { speed: 87, spin: 87, control: 93 },
  },
  {
    id: "xiaomi_yu7",
    name: "XIAOMI YU7",
    category: "ELEKTRİKLİ SUV",
    price: 2900,
    defaultColor: "#738b76",
    accentColor: "#b4f3ce",
    tagline: "Geniş gövdeli elektrikli SUV.",
    wheelRadius: 0.39,
    bodyScale: [1, 1, 1],
    stats: { speed: 90, spin: 82, control: 92 },
  },
  {
    id: "porsche_911",
    name: "PORSCHE 911 GT3",
    category: "SPOR COUPÉ",
    price: 6700,
    defaultColor: "#9a3948",
    accentColor: "#fa7e82",
    tagline: "Stüdyo modelinden ayrılan kaporta ve dengeli jantlar.",
    wheelRadius: 0.355,
    bodyScale: [1, 1, 1],
    stats: { speed: 96, spin: 90, control: 91 },
  },
];

export interface GarageState {
  wallet: number;
  ownedIds: VehicleId[];
  selectedId: VehicleId;
  colors: Record<VehicleId, string>;
}

const GARAGE_STORAGE_KEY = "scar.garage.v2";
const LEGACY_GARAGE_STORAGE_KEY = "scar.garage.bmw7.v1";
const STARTER: VehicleId = "renault_clio_iv";

function defaultColors(): Record<VehicleId, string> {
  return Object.fromEntries(
    VEHICLE_CATALOG.map((vehicle) => [vehicle.id, vehicle.defaultColor])
  ) as Record<VehicleId, string>;
}

export function createDefaultGarageState(): GarageState {
  return {
    wallet: 450,
    ownedIds: VEHICLE_CATALOG.filter((car) => car.price === 0).map((car) => car.id),
    selectedId: STARTER,
    colors: defaultColors(),
  };
}

function isVehicleId(id: unknown): id is VehicleId {
  return typeof id === "string" && VEHICLE_CATALOG.some((v) => v.id === id);
}

function normalizeGarageState(input: Partial<GarageState>): GarageState {
  const fallback = createDefaultGarageState();
  const wallet = typeof input.wallet === "number" && Number.isFinite(input.wallet)
    ? Math.max(0, Math.floor(input.wallet)) : fallback.wallet;
  const ownedIds = Array.isArray(input.ownedIds)
    ? input.ownedIds.filter(isVehicleId) : fallback.ownedIds;
  const owned = Array.from(new Set([...ownedIds, ...fallback.ownedIds]));
  const previousId = input.selectedId;
  const selectedId = isVehicleId(previousId) && owned.includes(previousId) ? previousId : STARTER;
  const colors = { ...defaultColors() };
  if (input.colors && typeof input.colors === "object") {
    for (const preset of VEHICLE_CATALOG) {
      const color = input.colors[preset.id];
      if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
        colors[preset.id] = color.toLowerCase() === "#e9eaec" ? "#dddcd7" : color;
      }
    }
  }
  return { wallet, ownedIds: owned, selectedId, colors };
}

export function loadGarageState(): GarageState {
  try {
    const raw = readGameData(GARAGE_STORAGE_KEY);
    const legacy = !raw;
    const source = raw ?? readGameData(LEGACY_GARAGE_STORAGE_KEY);
    if (!source) return createDefaultGarageState();
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return createDefaultGarageState();
    }
    const data = parsed as Partial<GarageState>;
    if (!legacy) return normalizeGarageState(data);
    const previous: unknown = data.selectedId;
    const selectedId = previous === "bmw_f10" ? "bmw_7_series"
      : previous === "nissan_gtr" ? "porsche_911"
        : isVehicleId(previous) ? previous : STARTER;
    const migrated = normalizeGarageState({ ...data, selectedId, ownedIds: [selectedId] });
    saveGarageState(migrated);
    return migrated;
  } catch {
    return createDefaultGarageState();
  }
}

export function saveGarageState(state: GarageState): void {
  try {
    writeGameData(GARAGE_STORAGE_KEY, JSON.stringify(normalizeGarageState(state)));
  } catch {
    // Storage may be disabled; keep game playable.
  }
}

export function getVehiclePreset(id: VehicleId): VehiclePreset {
  return VEHICLE_CATALOG.find((preset) => preset.id === id) ?? VEHICLE_CATALOG[0];
}

export function stuntCashReward(turns: number, isBackflip: boolean): number {
  const base = Math.max(1, Math.round(turns)) * 120;
  return isBackflip ? base + 50 : base;
}

export function isArcadeLevelId(id: LevelId): boolean {
  return String(id) === "arcade";
}
