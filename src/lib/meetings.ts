import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { meetingsDir, exists } from "./paths";
import { toDateStr } from "./notes";
import { cryptoRandomId, today } from "./projects";

/**
 * Meeting notes: structured logging of meetings that already happened (paste a
 * transcript or notes). Same file pattern as notes — Markdown + frontmatter in
 * a `meetings/` dir — but a distinct entity: no attachments, plus a `meeting`
 * field (the meeting name/series this entry belongs to) that the UI tags by.
 */
export interface MeetingMeta {
  id: string; // filename without .md
  title: string;
  meeting: string; // meeting name / series (the "tag")
  date: string;
  tags: string[];
  preview?: string; // short body preview for list cards (set by listMeetings)
}

export interface Meeting extends MeetingMeta {
  body: string;
}

function makePreview(content: string, max = 140): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const slice = flat.slice(0, max);
  const sentence = slice.match(/^.*?[.!?](?=\s|$)/);
  if (sentence && sentence[0].length >= 40) return sentence[0].trim();
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim() + "…";
}

export async function listMeetings(slug: string): Promise<MeetingMeta[]> {
  const dir = meetingsDir(slug);
  if (!(await exists(dir))) return [];
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  const out: MeetingMeta[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const { data, content } = matter(raw);
    out.push({
      id: f.replace(/\.md$/, ""),
      title: String(data.title ?? f.replace(/\.md$/, "")),
      meeting: String(data.meeting ?? ""),
      date: toDateStr(data.date),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      preview: makePreview(content),
    });
  }
  // Newest first by date, then id for stable ordering.
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
  return out;
}

export async function readMeeting(
  slug: string,
  id: string
): Promise<Meeting | null> {
  const file = path.join(meetingsDir(slug), `${id}.md`);
  if (!(await exists(file))) return null;
  const raw = await fs.readFile(file, "utf8");
  const { data, content } = matter(raw);
  return {
    id,
    title: String(data.title ?? id),
    meeting: String(data.meeting ?? ""),
    date: toDateStr(data.date),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    body: content.trim(),
  };
}

/** Read every meeting in full, oldest-first (for "Copy all"). */
export async function readAllMeetings(slug: string): Promise<Meeting[]> {
  const metas = await listMeetings(slug); // newest-first
  const out: Meeting[] = [];
  for (const m of metas.slice().reverse()) {
    const full = await readMeeting(slug, m.id);
    if (full) out.push(full);
  }
  return out;
}

export interface MeetingInput {
  title: string;
  meeting: string;
  date: string;
  tags: string[];
  body: string;
}

function serialize(input: MeetingInput, slug: string): string {
  const tags = input.tags.length ? `[${input.tags.join(", ")}]` : "[]";
  return [
    "---",
    `title: ${input.title || "Untitled meeting"}`,
    `meeting: ${input.meeting || ""}`,
    `date: ${input.date}`,
    `project: ${slug}`,
    `tags: ${tags}`,
    "---",
    "",
    input.body.trim(),
    "",
  ].join("\n");
}

export async function createMeeting(
  slug: string,
  input: Partial<MeetingInput>
): Promise<Meeting> {
  await fs.mkdir(meetingsDir(slug), { recursive: true });
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today();
  const base =
    (input.title || input.meeting || "meeting")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "meeting";
  let id = `${date}-${base}`;
  let n = 2;
  while (await exists(path.join(meetingsDir(slug), `${id}.md`))) {
    id = `${date}-${base}-${n++}`;
  }
  const full: MeetingInput = {
    title: input.title ?? "",
    meeting: input.meeting ?? "",
    date,
    tags: input.tags ?? [],
    body: input.body ?? "",
  };
  await fs.writeFile(path.join(meetingsDir(slug), `${id}.md`), serialize(full, slug));
  return { id, ...full, body: full.body.trim() };
}

export async function updateMeeting(
  slug: string,
  id: string,
  input: Partial<MeetingInput>
): Promise<Meeting | null> {
  const existing = await readMeeting(slug, id);
  if (!existing) return null;
  const nextDate =
    input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : existing.date;
  const full: MeetingInput = {
    title: input.title ?? existing.title,
    meeting: input.meeting ?? existing.meeting,
    // The filename id keeps its original date prefix (it's just an opaque id);
    // the displayed date comes from frontmatter, so editing the date is fine.
    date: nextDate,
    tags: input.tags ?? existing.tags,
    body: input.body ?? existing.body,
  };
  await fs.writeFile(path.join(meetingsDir(slug), `${id}.md`), serialize(full, slug));
  return { id, ...full, body: full.body.trim() };
}

export async function deleteMeeting(slug: string, id: string): Promise<boolean> {
  const file = path.join(meetingsDir(slug), `${id}.md`);
  if (!(await exists(file))) return false;
  await fs.unlink(file).catch(() => {});
  return true;
}
