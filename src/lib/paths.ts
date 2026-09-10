import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * DATA ROOT
 * ---------
 * All project data lives here as plain files (Markdown + JSON). This is the
 * folder you point Claude at, back up, and sync. Defaults to iCloud Drive so
 * the "backup = folder location" story works with zero app-side sync code.
 *
 * Override with the PROJECTHUB_DATA_DIR environment variable if you ever move it.
 */
export const DATA_DIR =
  process.env.PROJECTHUB_DATA_DIR ||
  path.join(
    os.homedir(),
    "Library",
    "Mobile Documents",
    "com~apple~CloudDocs",
    "ProjectHub"
  );

export const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

/** Turn a display name into a filesystem-safe slug used as the folder name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip remaining accents (é -> e, ü -> u)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project";
}

export function projectDir(slug: string): string {
  return path.join(DATA_DIR, slug);
}
export function reflectionsDir(slug: string) {
  return path.join(projectDir(slug), "reflections");
}
export function reflectionFile(slug: string, date: string) {
  return path.join(reflectionsDir(slug), `${date}.md`);
}
export function notesDir(slug: string) {
  return path.join(projectDir(slug), "notes");
}
export function attachmentsDir(slug: string) {
  return path.join(projectDir(slug), "attachments");
}
export function todosFile(slug: string) {
  return path.join(projectDir(slug), "todos.json");
}
export function projectFile(slug: string) {
  return path.join(projectDir(slug), "project.json");
}
export function companiesFile(slug: string) {
  return path.join(projectDir(slug), "companies.json");
}
export function evaluationsDir(slug: string) {
  return path.join(projectDir(slug), "evaluations");
}

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
