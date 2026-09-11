import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  researchFile,
  projectFile,
  notesDir,
  reflectionsDir,
  exists,
} from "./paths";
import { cryptoRandomId, getProject } from "./projects";
import { listNotes, readNote } from "./notes";
import { readAllReflections } from "./reflections";

/**
 * A research question is its own record so learnings can reference it by id and
 * it can carry full CRUD independently of project.json. Questions live in a
 * flat `research.json` at the project root (parallel to todos.json /
 * companies.json), NOT embedded in project.json — so editing a question never
 * rewrites project metadata or races with the placement fields.
 */
export interface ResearchQuestion {
  id: string;
  question: string;
  detail: string;
  status: "open" | "answered";
  createdAt: string;
}

export interface ResearchFile {
  items: ResearchQuestion[];
}

export function emptyResearch(): ResearchFile {
  return { items: [] };
}

export async function readResearch(slug: string): Promise<ResearchFile> {
  const file = researchFile(slug);
  if (!(await exists(file))) return migrateLegacy(slug);
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (Array.isArray(parsed?.items)) {
      return { items: parsed.items.filter(Boolean) };
    }
    return emptyResearch();
  } catch {
    return emptyResearch();
  }
}

/**
 * Projects created before Phase 2 stored research questions as a plain string[]
 * on project.json and have no research.json. On first read, convert any such
 * legacy questions into records and write the new file. Projects with no legacy
 * questions just get an empty file so the migration runs at most once.
 */
async function migrateLegacy(slug: string): Promise<ResearchFile> {
  if (!(await exists(projectFile(slug)))) return emptyResearch();
  let legacy: unknown = [];
  try {
    const p = await getProject(slug);
    legacy = (p as { researchQuestions?: unknown })?.researchQuestions ?? [];
  } catch {
    legacy = [];
  }
  const items: ResearchQuestion[] = Array.isArray(legacy)
    ? legacy
        .map((q) => (typeof q === "string" ? q.trim() : ""))
        .filter(Boolean)
        .map((question) => ({
          id: newQuestionId(),
          question,
          detail: "",
          status: "open" as const,
          createdAt: new Date().toISOString(),
        }))
    : [];
  const data: ResearchFile = { items };
  await writeResearch(slug, data);
  return data;
}

export async function writeResearch(
  slug: string,
  data: ResearchFile
): Promise<void> {
  await fs.writeFile(
    researchFile(slug),
    JSON.stringify({ items: data.items ?? [] }, null, 2)
  );
}

export function newQuestionId(): string {
  return `rq-${cryptoRandomId()}`;
}

export async function createQuestion(
  slug: string,
  input: { question: string; detail?: string }
): Promise<ResearchQuestion> {
  const file = await readResearch(slug);
  const q: ResearchQuestion = {
    id: newQuestionId(),
    question: input.question.trim() || "Untitled question",
    detail: (input.detail ?? "").trim(),
    status: "open",
    createdAt: new Date().toISOString(),
  };
  file.items.push(q);
  await writeResearch(slug, file);
  return q;
}

export async function updateQuestion(
  slug: string,
  id: string,
  patch: Partial<Pick<ResearchQuestion, "question" | "detail" | "status">>
): Promise<ResearchQuestion | null> {
  const file = await readResearch(slug);
  const q = file.items.find((x) => x.id === id);
  if (!q) return null;
  if (patch.question !== undefined) q.question = patch.question.trim() || q.question;
  if (patch.detail !== undefined) q.detail = patch.detail.trim();
  if (patch.status !== undefined) q.status = patch.status;
  await writeResearch(slug, file);
  return q;
}

export async function deleteQuestion(
  slug: string,
  id: string
): Promise<{ scrubbed: number } | null> {
  const file = await readResearch(slug);
  const next = file.items.filter((x) => x.id !== id);
  if (next.length === file.items.length) return null;
  await writeResearch(slug, { items: next });
  // Now that the question is really gone (this only runs at delete *finalize*,
  // after the undo window — same timing as note orphan-attachment cleanup),
  // strip its now-orphaned ref from any reflection/note that tagged it, so no
  // dangling reference is left behind.
  const scrubbed = await scrubResearchRef(slug, id);
  return { scrubbed };
}

/**
 * Rewrite only the `research:` frontmatter line of a single Markdown file,
 * removing `rqId`. Surgical (a line replace within the frontmatter block) so
 * the app's manual frontmatter formatting and the file body are untouched.
 * Returns true if the file was changed.
 */
async function stripRefFromFile(file: string, rqId: string): Promise<boolean> {
  const raw = await fs.readFile(file, "utf8");
  const { data } = matter(raw);
  const cur = Array.isArray(data.research) ? data.research.map(String) : [];
  if (!cur.includes(rqId)) return false;
  const nextIds = cur.filter((x) => x !== rqId);
  const val = nextIds.length ? `[${nextIds.join(", ")}]` : "[]";
  // Only replace inside the leading `---\n … \n---` frontmatter block.
  const m = raw.match(/^(---\n)([\s\S]*?)(\n---\n?)/);
  if (!m) return false;
  const front = /^research:.*$/m.test(m[2])
    ? m[2].replace(/^research:.*$/m, `research: ${val}`)
    : `${m[2]}\nresearch: ${val}`;
  await fs.writeFile(file, m[1] + front + m[3] + raw.slice(m[0].length));
  return true;
}

/** Remove a research-question id from every note and reflection that tags it. */
export async function scrubResearchRef(
  slug: string,
  rqId: string
): Promise<number> {
  let count = 0;
  for (const [dir, ext] of [
    [notesDir(slug), ".md"],
    [reflectionsDir(slug), ".md"],
  ] as const) {
    if (!(await exists(dir))) continue;
    for (const f of (await fs.readdir(dir)).filter((x) => x.endsWith(ext))) {
      if (await stripRefFromFile(path.join(dir, f), rqId)) count++;
    }
  }
  return count;
}

/**
 * A learning/finding surfaced under a research question. These are never stored
 * on the question — they are computed live by scanning which notes and
 * reflections tagged themselves to the question id (same principle as the
 * to-do buckets: derived from source data, never hand-assigned).
 */
export interface Finding {
  kind: "note" | "reflection";
  ref: string; // note id, or reflection date (YYYY-MM-DD)
  title: string;
  date: string;
  snippet: string;
}

function firstNonEmpty(...parts: (string | undefined)[]): string {
  for (const p of parts) {
    const t = (p ?? "").trim();
    if (t) return t;
  }
  return "";
}

function clip(s: string, n = 240): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1) + "…" : flat;
}

/**
 * Build a map of research-question id -> findings, aggregating every note and
 * reflection in the project that references that id in its frontmatter.
 * Returned findings are newest-first within each question.
 */
export async function collectFindings(
  slug: string
): Promise<Record<string, Finding[]>> {
  const out: Record<string, Finding[]> = {};
  const push = (id: string, f: Finding) => {
    (out[id] ??= []).push(f);
  };

  // Notes: meta carries the research refs; read the body for a snippet only for
  // notes that are actually tagged.
  const notes = await listNotes(slug);
  for (const meta of notes) {
    if (!meta.research?.length) continue;
    const full = await readNote(slug, meta.id);
    const snippet = clip(stripImages(full?.body ?? ""));
    for (const id of meta.research) {
      push(id, {
        kind: "note",
        ref: meta.id,
        title: meta.title,
        date: meta.date,
        snippet,
      });
    }
  }

  // Reflections: readAllReflections includes the research refs on each.
  const reflections = await readAllReflections(slug);
  for (const { date, data } of reflections) {
    if (!data.research?.length) continue;
    const snippet = clip(
      firstNonEmpty(data.learned, data.clearer, data.noticed, data.notes)
    );
    for (const id of data.research) {
      push(id, {
        kind: "reflection",
        ref: date,
        title: `Reflection · ${date}`,
        date,
        snippet,
      });
    }
  }

  for (const id of Object.keys(out)) {
    out[id].sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  return out;
}

function stripImages(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^!\[.*\]\(.*\)\s*$/.test(line.trim()))
    .join("\n");
}
