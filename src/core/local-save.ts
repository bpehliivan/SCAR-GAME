export const GAME_KEYS = [
  "scar.garage.v2", "scar.garage.bmw7.v1", "scar.driver.v1",
  "rdstr.settings", "rdstr.best", "scar.tutorial.v1",
] as const;

type SavePatch = Record<string, string | null>;
interface DesktopSave {
  read(key: string): string | null | undefined;
  update(values: SavePatch): boolean;
}

function desktopSave(): DesktopSave | undefined {
  return (window as Window & { scarSave?: DesktopSave }).scarSave;
}

export function readGameData(key: string): string | null {
  const bridge = desktopSave();
  const saved = bridge?.read(key);
  if (saved !== undefined) return saved;
  const legacy = localStorage.getItem(key);
  if (legacy !== null) bridge?.update({ [key]: legacy });
  return legacy;
}

export function writeGameData(key: string, value: string): void {
  updateGameData({ [key]: value });
}

export function updateGameData(values: SavePatch): void {
  const bridge = desktopSave();
  if (bridge) {
    if (!bridge.update(values)) throw new Error("Kayıt diske yazılamadı.");
    return;
  }
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, localStorage.getItem(key)]));
  const apply = (patch: SavePatch) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  };
  try {
    apply(values);
  } catch (error) {
    apply(previous);
    throw error;
  }
}
