import fs from "node:fs/promises";
import { SETTINGS_FILE, ensureDataDir, exists } from "./paths";

export type ThemeName = "dark" | "light" | "beige";

/** Default center + zoom for the Companies map before any pins exist. */
export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export interface Settings {
  theme: ThemeName;
  lastProject: string | null;
  /**
   * Fallback view for the Companies map when a project has no located pins yet.
   * Neutral world view by default; the user can set their own from the map
   * (see the Companies overview). Kept in settings, not hardcoded, so the app
   * ships without pointing at any particular place.
   */
  mapDefault: MapView;
  createdAt: string;
}

/** Neutral, place-agnostic world view. */
const DEFAULT_MAP_VIEW: MapView = { lat: 20, lng: 0, zoom: 2 };

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  lastProject: null,
  mapDefault: { ...DEFAULT_MAP_VIEW },
  createdAt: new Date().toISOString(),
};

export async function readSettings(): Promise<Settings> {
  await ensureDataDir();
  if (!(await exists(SETTINGS_FILE))) {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  const next = { ...current, ...patch };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}
