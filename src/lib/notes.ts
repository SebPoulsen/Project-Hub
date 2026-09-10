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
}

export interface Note extends NoteMeta {
  body: string;
}

export async function listNotes(slug: string): Promise<NoteMeta[]> {
  const dir = notesDir(slug);
  if (!(await exists(dir))) return [];
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  const notes: NoteMeta[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const { data } = matter(raw);
    notes.push({
      id: f.replace(/\.md$/, ""),
      title: String(data.title ?? f.replace(/\.md$/, "")),
      date: String(data.date ?? ""),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      attachments: Array.isArray(data.attachments)
        ? data.attachments.map(String)
        : [],
    });
  }
  notes.sort((a, b) => (a.id < b.id ? 1 : -1));
  return notes;
}

export async function readNote(slug: string, id: string): Promise<Note | null> {
  const file = path.join(notesDir(slug), `${id}.md`);
  if (!(await exists(file))) return null;
  const raw = await fs.readFile(file, "utf8");
  const { data, content } = matter(raw);
  return {
    id,
    title: String(data.title ?? id),
    date: String(data.date ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    attachments: Array.isArray(data.attachments)
      ? data.attachments.map(String)
      : [],
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
    body: input.body.trim(),
  };
}
