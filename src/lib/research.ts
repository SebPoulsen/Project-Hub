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
import { normalizePlacementTag, type PlacementTag } from "./placement-tag";

/**
 * A research question is its own record so learnings can reference it by id and
 * it can carry full CRUD independently of project.json. Questions live in a
 * flat `research.json` at the project root (parallel to todos.json /
 * companies.json), NOT embedded in project.json — so editing a question never
 * rewrites project metadata or races with the placement fields.
 */
/**
 * A sub-question: its own question text, living inside one group. It is
 * independently taggable from notes/reflections via the SAME `research:`
 * frontmatter mechanism as an overarching question — its `rs-…` id can appear
 * in a `research:` list, and findings for it are computed live by the same
 * scan (collectFindings buckets by whatever id it sees). Sub-questions carry no
 * placement of their own — placement lives on the overarching question.
 */
export interface SubQuestion {
  id: string; // rs-…
  question: string;
  createdAt: string;
}

/**
 * A titled cluster of sub-questions, belonging to exactly one overarching
 * question. Groups are organizational containers only — a group id (`rg-…`) is
 * NEVER tagged and holds no findings of its own; it just clusters its
 * sub-questions for display.
 */
export interface SubGroup {
  id: string; // rg-…
  title: string;
  createdAt: string;
  subQuestions: SubQuestion[];
}

export interface ResearchQuestion {
  id: string;
  question: string;
  detail: string;
  status: "open" | "answered";
  placement: PlacementTag | null; // optional within-project placement tag
  /**
   * Nested sub-question groups (Phase 2). A new *layer* on the flat question
   * record — not a separate collection — so a question and its whole
   * sub-structure stay in one record and one write. Defaults to [] on read for
   * questions saved before this field existed.
   */
  groups: SubGroup[];
  createdAt: string;
}

export interface ResearchFile {
  items: ResearchQuestion[];
}

export function emptyResearch(): ResearchFile {
  return { items: [] };
}

/** Coerce arbitrary parsed JSON into a well-formed SubGroup[] (drops junk). */
function normalizeGroups(raw: unknown): SubGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(Boolean)
    .map((g: Partial<SubGroup> & { subQuestions?: unknown }) => ({
      id: String(g.id ?? newGroupId()),
      title: String(g.title ?? ""),
      createdAt: String(g.createdAt ?? new Date().toISOString()),
      subQuestions: Array.isArray(g.subQuestions)
        ? g.subQuestions
            .filter(Boolean)
            .map((s: Partial<SubQuestion>) => ({
              id: String(s.id ?? newSubQuestionId()),
              question: String(s.question ?? ""),
              createdAt: String(s.createdAt ?? new Date().toISOString()),
            }))
        : [],
    }));
}

export async function readResearch(slug: string): Promise<ResearchFile> {
  const file = researchFile(slug);
  if (!(await exists(file))) return migrateLegacy(slug);
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (Array.isArray(parsed?.items)) {
      return {
        items: parsed.items.filter(Boolean).map((q: ResearchQuestion) => ({
          ...q,
          placement: normalizePlacementTag(q.placement),
          groups: normalizeGroups((q as { groups?: unknown }).groups),
        })),
      };
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
          placement: null,
          groups: [],
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

export function newGroupId(): string {
  return `rg-${cryptoRandomId()}`;
}

export function newSubQuestionId(): string {
  return `rs-${cryptoRandomId()}`;
}

export async function createQuestion(
  slug: string,
  input: { question: string; detail?: string; placement?: unknown }
): Promise<ResearchQuestion> {
  const file = await readResearch(slug);
  const q: ResearchQuestion = {
    id: newQuestionId(),
    question: input.question.trim() || "Untitled question",
    detail: (input.detail ?? "").trim(),
    status: "open",
    placement: normalizePlacementTag(input.placement),
    groups: [],
    createdAt: new Date().toISOString(),
  };
  file.items.push(q);
  await writeResearch(slug, file);
  return q;
}

export async function updateQuestion(
  slug: string,
  id: string,
  patch: Partial<Pick<ResearchQuestion, "question" | "detail" | "status">> & {
    placement?: unknown;
  }
): Promise<ResearchQuestion | null> {
  const file = await readResearch(slug);
  const q = file.items.find((x) => x.id === id);
  if (!q) return null;
  if (patch.question !== undefined) q.question = patch.question.trim() || q.question;
  if (patch.detail !== undefined) q.detail = patch.detail.trim();
  if (patch.status !== undefined) q.status = patch.status;
  if (patch.placement !== undefined) q.placement = normalizePlacementTag(patch.placement);
  await writeResearch(slug, file);
  return q;
}

export async function deleteQuestion(
  slug: string,
  id: string
): Promise<{ scrubbed: number } | null> {
  const file = await readResearch(slug);
  const target = file.items.find((x) => x.id === id);
  const next = file.items.filter((x) => x.id !== id);
  if (next.length === file.items.length) return null;
  await writeResearch(slug, { items: next });
  // Now that the question is really gone (this only runs at delete *finalize*,
  // after the undo window — same timing as note orphan-attachment cleanup),
  // strip its now-orphaned ref from any reflection/note that tagged it, so no
  // dangling reference is left behind. Deleting the question also takes its
  // whole sub-question subtree with it, so scrub every descendant `rs-…` id too.
  const ids = [
    id,
    ...(target?.groups ?? []).flatMap((g) => g.subQuestions.map((s) => s.id)),
  ];
  const scrubbed = await scrubResearchRefs(slug, ids);
  return { scrubbed };
}

// ── Sub-question groups ────────────────────────────────────────────────────

export async function createGroup(
  slug: string,
  rqId: string,
  input: { title: string }
): Promise<SubGroup | null> {
  const file = await readResearch(slug);
  const q = file.items.find((x) => x.id === rqId);
  if (!q) return null;
  const g: SubGroup = {
    id: newGroupId(),
    title: input.title.trim() || "Untitled group",
    createdAt: new Date().toISOString(),
    subQuestions: [],
  };
  q.groups.push(g);
  await writeResearch(slug, file);
  return g;
}

export async function updateGroup(
  slug: string,
  rqId: string,
  groupId: string,
  patch: { title?: string }
): Promise<SubGroup | null> {
  const file = await readResearch(slug);
  const g = file.items.find((x) => x.id === rqId)?.groups.find((x) => x.id === groupId);
  if (!g) return null;
  if (patch.title !== undefined) g.title = patch.title.trim() || g.title;
  await writeResearch(slug, file);
  return g;
}

export async function deleteGroup(
  slug: string,
  rqId: string,
  groupId: string
): Promise<{ scrubbed: number } | null> {
  const file = await readResearch(slug);
  const q = file.items.find((x) => x.id === rqId);
  if (!q) return null;
  const g = q.groups.find((x) => x.id === groupId);
  if (!g) return null;
  q.groups = q.groups.filter((x) => x.id !== groupId);
  await writeResearch(slug, file);
  // Delete finalize (post undo window): every sub-question in the group is gone,
  // so scrub each of their `rs-…` ids from any note/reflection that tagged them.
  const scrubbed = await scrubResearchRefs(
    slug,
    g.subQuestions.map((s) => s.id)
  );
  return { scrubbed };
}

// ── Sub-questions ──────────────────────────────────────────────────────────

export async function createSubQuestion(
  slug: string,
  rqId: string,
  groupId: string,
  input: { question: string }
): Promise<SubQuestion | null> {
  const file = await readResearch(slug);
  const g = file.items.find((x) => x.id === rqId)?.groups.find((x) => x.id === groupId);
  if (!g) return null;
  const s: SubQuestion = {
    id: newSubQuestionId(),
    question: input.question.trim() || "Untitled sub-question",
    createdAt: new Date().toISOString(),
  };
  g.subQuestions.push(s);
  await writeResearch(slug, file);
  return s;
}

export async function updateSubQuestion(
  slug: string,
  rqId: string,
  groupId: string,
  subId: string,
  patch: { question?: string }
): Promise<SubQuestion | null> {
  const file = await readResearch(slug);
  const s = file.items
    .find((x) => x.id === rqId)
    ?.groups.find((x) => x.id === groupId)
    ?.subQuestions.find((x) => x.id === subId);
  if (!s) return null;
  if (patch.question !== undefined) s.question = patch.question.trim() || s.question;
  await writeResearch(slug, file);
  return s;
}

export async function deleteSubQuestion(
  slug: string,
  rqId: string,
  groupId: string,
  subId: string
): Promise<{ scrubbed: number } | null> {
  const file = await readResearch(slug);
  const g = file.items.find((x) => x.id === rqId)?.groups.find((x) => x.id === groupId);
  if (!g) return null;
  const before = g.subQuestions.length;
  g.subQuestions = g.subQuestions.filter((x) => x.id !== subId);
  if (g.subQuestions.length === before) return null;
  await writeResearch(slug, file);
  // Delete finalize: strip this sub-question's `rs-…` id from tagged entries.
  const scrubbed = await scrubResearchRef(slug, subId);
  return { scrubbed };
}

/**
 * Rewrite only the `research:` frontmatter line of a single Markdown file,
 * removing `rqId`. Surgical (a line replace within the frontmatter block) so
 * the app's manual frontmatter formatting and the file body are untouched.
 * Returns true if the file was changed.
 */
async function stripRefsFromFile(
  file: string,
  ids: Set<string>
): Promise<boolean> {
  const raw = await fs.readFile(file, "utf8");
  const { data } = matter(raw);
  const cur = Array.isArray(data.research) ? data.research.map(String) : [];
  if (!cur.some((x) => ids.has(x))) return false;
  const nextIds = cur.filter((x) => !ids.has(x));
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

/**
 * Remove any of `ids` (an overarching `rq-…` and/or sub-question `rs-…` ids)
 * from every note and reflection that tags one — one pass over the files,
 * rewriting each touched file at most once regardless of how many ids matched.
 */
export async function scrubResearchRefs(
  slug: string,
  ids: string[]
): Promise<number> {
  const set = new Set(ids.filter(Boolean));
  if (set.size === 0) return 0;
  let count = 0;
  for (const [dir, ext] of [
    [notesDir(slug), ".md"],
    [reflectionsDir(slug), ".md"],
  ] as const) {
    if (!(await exists(dir))) continue;
    for (const f of (await fs.readdir(dir)).filter((x) => x.endsWith(ext))) {
      if (await stripRefsFromFile(path.join(dir, f), set)) count++;
    }
  }
  return count;
}

/** Convenience single-id wrapper over {@link scrubResearchRefs}. */
export async function scrubResearchRef(
  slug: string,
  rqId: string
): Promise<number> {
  return scrubResearchRefs(slug, [rqId]);
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
