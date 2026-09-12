import fs from "node:fs/promises";
import path from "node:path";
import {
  DATA_DIR,
  ensureDataDir,
  exists,
  slugify,
  projectDir,
  projectFile,
  reflectionsDir,
  notesDir,
  meetingsDir,
  attachmentsDir,
  todosFile,
  companiesFile,
  researchFile,
  evaluationsDir,
} from "./paths";
import { commitAll } from "./git";
import { serializeReflection } from "./reflections";
import { emptyTodos } from "./todos";

import {
  type Placement,
  emptyPlacement,
  normalizePlacement,
} from "./placement";

// Re-export the placement API so existing `@/lib/projects` importers keep working.
export * from "./placement";

export interface Project {
  name: string;
  slug: string;
  startDate: string;
  endDate: string | null;
  researchQuestions: string[];
  placement: Placement;
  createdAt: string;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalize a parsed project.json into a well-formed Project. */
function normalizeProject(raw: Record<string, unknown>): Project {
  return {
    name: String(raw.name ?? "Untitled project"),
    slug: String(raw.slug ?? ""),
    startDate: String(raw.startDate ?? today()),
    endDate: raw.endDate ? String(raw.endDate) : null,
    researchQuestions: Array.isArray(raw.researchQuestions)
      ? (raw.researchQuestions as unknown[]).map(String)
      : [],
    placement: normalizePlacement(raw.placement),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
}

export async function listProjects(): Promise<Project[]> {
  await ensureDataDir();
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const projects: Project[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const pf = projectFile(e.name);
    if (await exists(pf)) {
      try {
        const raw = await fs.readFile(pf, "utf8");
        projects.push(normalizeProject(JSON.parse(raw)));
      } catch {
        // Skip folders with an unreadable project.json rather than crashing.
      }
    }
  }
  projects.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return projects;
}

export async function getProject(slug: string): Promise<Project | null> {
  const pf = projectFile(slug);
  if (!(await exists(pf))) return null;
  return normalizeProject(JSON.parse(await fs.readFile(pf, "utf8")));
}

/**
 * Merge a partial update into project.json (currently used for placement).
 * Reads the raw file, applies the patch, normalizes, and writes it back — the
 * caller commits.
 */
export async function updateProject(
  slug: string,
  patch: Partial<Pick<Project, "name" | "endDate" | "placement">>
): Promise<Project | null> {
  const pf = projectFile(slug);
  if (!(await exists(pf))) return null;
  const raw = JSON.parse(await fs.readFile(pf, "utf8"));
  const next = {
    ...raw,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
    ...(patch.placement !== undefined
      ? { placement: normalizePlacement(patch.placement) }
      : {}),
  };
  await fs.writeFile(pf, JSON.stringify(next, null, 2));
  return normalizeProject(next);
}

/**
 * Permanently delete a project folder and everything in it (reflections, notes,
 * todos, attachments, git history). Irreversible — the caller gates this behind
 * a type-the-name confirmation. Guarded to only ever remove a direct child of
 * the data dir.
 */
export async function deleteProject(slug: string): Promise<boolean> {
  const dir = projectDir(slug);
  const parent = path.dirname(dir);
  if (parent !== DATA_DIR || path.basename(dir) !== slug) return false;
  if (!(await exists(projectFile(slug)))) return false;
  await fs.rm(dir, { recursive: true, force: true });
  return true;
}

/**
 * Create a new project by materializing the full folder schema. Every project
 * is a self-contained git repo, so it can be moved, backed up, or handed to
 * Claude on its own.
 *
 * `withExamples` (default true) seeds one reflection, a few todos, and a
 * welcome note so a fresh project shows how each piece looks on disk.
 */
export async function createProject(
  name: string,
  withExamples = true
): Promise<Project> {
  await ensureDataDir();
  let slug = slugify(name);
  // Avoid clobbering an existing folder.
  let n = 2;
  while (await exists(projectDir(slug))) {
    slug = `${slugify(name)}-${n++}`;
  }

  const project: Project = {
    name: name.trim() || "Untitled project",
    slug,
    startDate: today(),
    endDate: null,
    researchQuestions: [],
    placement: emptyPlacement(),
    createdAt: new Date().toISOString(),
  };

  // Scaffold the folder structure.
  await fs.mkdir(reflectionsDir(slug), { recursive: true });
  await fs.mkdir(notesDir(slug), { recursive: true });
  await fs.mkdir(meetingsDir(slug), { recursive: true });
  await fs.mkdir(attachmentsDir(slug), { recursive: true });
  await fs.mkdir(evaluationsDir(slug), { recursive: true });

  await fs.writeFile(projectFile(slug), JSON.stringify(project, null, 2));
  await fs.writeFile(todosFile(slug), JSON.stringify(emptyTodos(), null, 2));
  await fs.writeFile(companiesFile(slug), JSON.stringify({ items: [] }, null, 2));
  // Research questions live in their own flat collection (Phase 2). project.json
  // keeps its (now-legacy) researchQuestions field only for back-compat reads.
  await fs.writeFile(
    researchFile(slug),
    JSON.stringify({ items: [] }, null, 2)
  );
  // Keep the (Phase 2) evaluations dir tracked by git even while empty.
  await fs.writeFile(path.join(evaluationsDir(slug), ".gitkeep"), "");

  if (withExamples) {
    await seedExamples(project);
  }

  await commitAll(slug, `init: create project "${project.name}"`);
  return project;
}

async function seedExamples(project: Project): Promise<void> {
  const slug = project.slug;
  const date = today();

  // Example reflection for today.
  const reflectionMd = serializeReflection(
    {
      noticed: "Set up Project Hub today. Everything lives as plain files in iCloud.",
      learned:
        "The three reflection prompts create a nice daily rhythm without much friction.",
      clearer:
        "I want this to replace my Notion setup — more structure, but still legible files.",
      notes:
        "This is an example entry. Edit or delete it. Tip: hand this whole folder to Claude anytime.",
      tags: ["example", "setup"],
      research: [],
      placement: null,
    },
    { date, project: slug }
  );
  await fs.writeFile(path.join(reflectionsDir(slug), `${date}.md`), reflectionMd);

  // Example todos (flat list; buckets are computed from `due`). Dates are
  // chosen so the examples land across Today / This Week / Later.
  const tomorrow = new Date(new Date(date + "T00:00:00").getTime() + 86400000)
    .toISOString()
    .slice(0, 10);
  const todos = emptyTodos();
  todos.items.push(mkTodo("Write my first real reflection", { due: date }));
  todos.items.push(
    mkTodo("Pick a color palette I like", { due: date, done: true })
  );
  todos.items.push(
    mkTodo("Add my project's research questions", { due: tomorrow })
  );
  todos.items.push(mkTodo("Plan first company visit (Phase 2)", { due: null }));
  await fs.writeFile(todosFile(slug), JSON.stringify(todos, null, 2));

  // Example note + a placeholder attachment (SVG so no binary is needed).
  const svg = welcomeSvg(project.name);
  await fs.writeFile(path.join(attachmentsDir(slug), "welcome.svg"), svg);
  const noteMd = [
    "---",
    "title: Welcome to Project Hub",
    `date: ${date}`,
    `project: ${slug}`,
    "tags: [example]",
    "attachments: [welcome.svg]",
    "---",
    "",
    "This is a note. Notes support photos — they are stored in `../attachments/`",
    "and referenced by relative path, so the Markdown stays portable.",
    "",
    "![Welcome](../attachments/welcome.svg)",
    "",
    "Delete this note whenever you like.",
    "",
  ].join("\n");
  await fs.writeFile(path.join(notesDir(slug), `${date}-welcome.md`), noteMd);
}

function mkTodo(
  text: string,
  opts: { due?: string | null; done?: boolean } = {}
) {
  return {
    id: cryptoRandomId(),
    text,
    done: opts.done ?? false,
    due: opts.due ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function cryptoRandomId(): string {
  // Node 19+ has global crypto; fall back just in case.
  try {
    return (globalThis.crypto as Crypto).randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function welcomeSvg(name: string): string {
  const safe = name.replace(/[<&>]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
  <rect width="480" height="300" fill="#12151c"/>
  <circle cx="240" cy="120" r="52" fill="none" stroke="#e8a94a" stroke-width="6"/>
  <path d="M215 120 l18 18 l34 -40" fill="none" stroke="#e8a94a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="240" y="210" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#f2ede4">Project Hub</text>
  <text x="240" y="242" text-anchor="middle" font-family="monospace" font-size="13" fill="#8b93a3">${safe}</text>
</svg>`;
}
