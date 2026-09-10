import fs from "node:fs/promises";
import { SETTINGS_FILE, ensureDataDir, exists } from "./paths";

export type ThemeName = "dark" | "light" | "beige";

export interface Settings {
  theme: ThemeName;
  lastProject: string | null;
  createdAt: string;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  lastProject: null,
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
