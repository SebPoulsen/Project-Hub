import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  notesDir,
  attachmentsDir,
  exists,
} from "./paths";
import { cryptoRandomId, today } from "./projects";

export interface NoteMeta {
  id: string; // filename without .md
  title: string;
  date: string;
  tags: string[];
  attachments: string[];
  /** Research-question ids this note is tagged to (see lib/research.ts). */
  research: string[];
  /** Short plain-text preview of the body (list cards). Set by listNotes. */
  preview?: string;
}

/** Build a truncated, image-stripped one-line preview of a note body. */
function makePreview(content: string, max = 140): string {
  const flat = content
    .split("\n")
    .filter((line) => !/^!\[.*\]\(.*\)\s*$/.test(line.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  // Prefer to cut at the first sentence end within range, else at a word.
  const slice = flat.slice(0, max);
  const sentence = slice.match(/^.*?[.!?](?=\s|$)/);
  if (sentence && sentence[0].length >= 40) return sentence[0].trim();
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim() + "…";
}

export interface Note extends NoteMeta {
  body: string;
}

/**
 * Normalize a frontmatter date to a clean YYYY-MM-DD string.
 *
 * YAML parses an unquoted `date: 2026-09-10` into a JS Date, so `String(date)`
 * would produce an ugly full timestamp ("Thu Sep 10 2026 …"). This collapses
 * both Date objects and ISO strings back to the date part. Exported so any
 * other frontmatter reader can reuse the same normalization.
 */
export function toDateStr(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s;
}

export async function listNotes(slug: string): Promise<NoteMeta[]> {
  const dir = notesDir(slug);
  if (!(await exists(dir))) return [];
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  const notes: NoteMeta[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const { data, content } = matter(raw);
    notes.push({
      id: f.replace(/\.md$/, ""),
      title: String(data.title ?? f.replace(/\.md$/, "")),
      date: toDateStr(data.date),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      attachments: Array.isArray(data.attachments)
        ? data.attachments.map(String)
        : [],
      research: Array.isArray(data.research) ? data.research.map(String) : [],
      preview: makePreview(content),
    });
  }
  notes.sort((a, b) => (a.id < b.id ? 1 : -1));
  return notes;
}

/** Read every note for a project in full, oldest-first (for "Copy all"). */
export async function readAllNotes(slug: string): Promise<Note[]> {
  const metas = await listNotes(slug); // newest-first
  const out: Note[] = [];
  for (const m of metas.slice().reverse()) {
    const note = await readNote(slug, m.id);
    if (note) out.push(note);
  }
  return out;
}

export async function readNote(slug: string, id: string): Promise<Note | null> {
  const file = path.join(notesDir(slug), `${id}.md`);
  if (!(await exists(file))) return null;
  const raw = await fs.readFile(file, "utf8");
  const { data, content } = matter(raw);
  return {
    id,
    title: String(data.title ?? id),
    date: toDateStr(data.date),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    attachments: Array.isArray(data.attachments)
      ? data.attachments.map(String)
      : [],
    research: Array.isArray(data.research) ? data.research.map(String) : [],
    body: content.trim(),
  };
}

/** Sanitize a user-supplied attachment filename to a safe basename. */
function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || `file-${cryptoRandomId()}`;
}

export interface CreateNoteInput {
  title: string;
  body: string;
  tags: string[];
  research: string[];
  attachments: { filename: string; bytes: Buffer }[];
}

export async function createNote(
  slug: string,
  input: CreateNoteInput
): Promise<Note> {
  await fs.mkdir(notesDir(slug), { recursive: true });
  await fs.mkdir(attachmentsDir(slug), { recursive: true });

  const date = today();
  const titleSlug =
    input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "note";
  let id = `${date}-${titleSlug}`;
  let n = 2;
  while (await exists(path.join(notesDir(slug), `${id}.md`))) {
    id = `${date}-${titleSlug}-${n++}`;
  }

  // Write attachments with unique, safe names.
  const savedNames: string[] = [];
  for (const att of input.attachments) {
    let fname = `${id}-${safeFilename(att.filename)}`;
    let k = 2;
    while (await exists(path.join(attachmentsDir(slug), fname))) {
      const ext = path.extname(fname);
      fname = `${id}-${k++}-${safeFilename(att.filename)}${ext ? "" : ""}`;
    }
    await fs.writeFile(path.join(attachmentsDir(slug), fname), att.bytes);
    savedNames.push(fname);
  }

  const tags = input.tags.length ? `[${input.tags.join(", ")}]` : "[]";
  const research = input.research.length ? `[${input.research.join(", ")}]` : "[]";
  const attachYaml = savedNames.length ? `[${savedNames.join(", ")}]` : "[]";
  const imageBlock = savedNames
    .map((f) => `![${f}](../attachments/${f})`)
    .join("\n\n");

  const md = [
    "---",
    `title: ${input.title || "Untitled note"}`,
    `date: ${date}`,
    `project: ${slug}`,
    `tags: ${tags}`,
    `research: ${research}`,
    `attachments: ${attachYaml}`,
    "---",
    "",
    input.body.trim(),
    savedNames.length ? "\n" + imageBlock + "\n" : "",
  ].join("\n");

  await fs.writeFile(path.join(notesDir(slug), `${id}.md`), md);

  return {
    id,
    title: input.title || "Untitled note",
    date,
    tags: input.tags,
    attachments: savedNames,
    research: input.research,
    body: input.body.trim(),
  };
}

export interface UpdateNoteInput {
  title: string;
  body: string; // clean body text WITHOUT the trailing image markdown block
  tags: string[];
  research: string[];
  keepAttachments: string[]; // existing attachment filenames to retain
  newAttachments: { filename: string; bytes: Buffer }[];
}

/**
 * Update an existing note in place (same id/filename, preserving its original
 * date). Retains the attachments listed in `keepAttachments`, appends any newly
 * uploaded ones, and cleans up attachments dropped by the edit — but only if no
 * other note still references them (see removeOrphans).
 */
export async function updateNote(
  slug: string,
  id: string,
  input: UpdateNoteInput
): Promise<Note | null> {
  const existing = await readNote(slug, id);
  if (!existing) return null;

  await fs.mkdir(attachmentsDir(slug), { recursive: true });

  // Save newly uploaded attachments with unique names.
  const savedNew: string[] = [];
  for (const att of input.newAttachments) {
    let fname = `${id}-${safeFilename(att.filename)}`;
    let k = 2;
    while (await exists(path.join(attachmentsDir(slug), fname))) {
      fname = `${id}-${k++}-${safeFilename(att.filename)}`;
    }
    await fs.writeFile(path.join(attachmentsDir(slug), fname), att.bytes);
    savedNew.push(fname);
  }

  const finalAttachments = [...input.keepAttachments, ...savedNew];
  const tags = input.tags.length ? `[${input.tags.join(", ")}]` : "[]";
  const research = input.research.length ? `[${input.research.join(", ")}]` : "[]";
  const attachYaml = finalAttachments.length
    ? `[${finalAttachments.join(", ")}]`
    : "[]";
  const imageBlock = finalAttachments
    .map((f) => `![${f}](../attachments/${f})`)
    .join("\n\n");

  const md = [
    "---",
    `title: ${input.title || "Untitled note"}`,
    `date: ${existing.date}`,
    `project: ${slug}`,
    `tags: ${tags}`,
    `research: ${research}`,
    `attachments: ${attachYaml}`,
    "---",
    "",
    input.body.trim(),
    finalAttachments.length ? "\n" + imageBlock + "\n" : "",
  ].join("\n");

  await fs.writeFile(path.join(notesDir(slug), `${id}.md`), md);

  // Clean up any attachment this edit removed, if now unreferenced.
  const dropped = existing.attachments.filter(
    (a) => !input.keepAttachments.includes(a)
  );
  await removeOrphans(slug, dropped, id);

  return {
    id,
    title: input.title || "Untitled note",
    date: existing.date,
    tags: input.tags,
    attachments: finalAttachments,
    research: input.research,
    body: input.body.trim(),
  };
}

/**
 * Delete a note and remove its attachments that nothing else references.
 * Returns which attachment files were actually removed.
 */
export async function deleteNote(
  slug: string,
  id: string
): Promise<{ removedAttachments: string[] } | null> {
  const note = await readNote(slug, id);
  if (!note) return null;

  await fs.unlink(path.join(notesDir(slug), `${id}.md`)).catch(() => {});
  const removed = await removeOrphans(slug, note.attachments, id);
  return { removedAttachments: removed };
}

/**
 * Is `filename` referenced by any note OTHER than `exceptId`? Checks both the
 * frontmatter `attachments` list and inline `../attachments/<file>` markdown in
 * the body. Attachments are only ever used by notes in Phase 1, so notes are the
 * only place we need to scan.
 */
async function isReferenced(
  slug: string,
  filename: string,
  exceptId: string
): Promise<boolean> {
  const dir = notesDir(slug);
  if (!(await exists(dir))) return false;
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const noteId = f.replace(/\.md$/, "");
    if (noteId === exceptId) continue;
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const { data, content } = matter(raw);
    const listed =
      Array.isArray(data.attachments) &&
      data.attachments.map(String).includes(filename);
    if (listed || content.includes(filename)) return true;
  }
  return false;
}

/** Delete each file that is not referenced by any note except `exceptId`. */
async function removeOrphans(
  slug: string,
  files: string[],
  exceptId: string
): Promise<string[]> {
  const removed: string[] = [];
  for (const f of files) {
    // Extra safety: only ever touch a plain basename inside attachments/.
    if (path.basename(f) !== f) continue;
    if (await isReferenced(slug, f, exceptId)) continue;
    const full = path.join(attachmentsDir(slug), f);
    try {
      await fs.unlink(full);
      removed.push(f);
    } catch {
      // already gone / not present — ignore
    }
  }
  return removed;
}
