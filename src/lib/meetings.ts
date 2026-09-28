import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { meetingsDir, attachmentsDir, exists } from "./paths";
import { toDateStr } from "./notes";
import { cryptoRandomId, today } from "./projects";
import { normalizePlacementTag, type PlacementTag } from "./placement-tag";

/**
 * Meeting notes: structured logging of meetings that already happened (paste a
 * transcript or notes). Same file pattern as notes — Markdown + frontmatter in
 * a `meetings/` dir — plus a `meeting` field (the meeting name/series this entry
 * belongs to) that the UI tags by. Text is primary; a meeting may also carry PDF
 * attachments (the real document that travelled with it), tracked in the
 * frontmatter `attachments:` list and stored under the project's attachments/.
 */
export interface MeetingMeta {
  id: string; // filename without .md
  title: string;
  meeting: string; // meeting name / series (the "tag")
  date: string;
  tags: string[];
  placement: PlacementTag | null; // optional within-project placement tag
  attachments: string[]; // attachment filenames (PDFs); [] when none
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
      placement: normalizePlacementTag(data.placement),
      attachments: Array.isArray(data.attachments)
        ? data.attachments.map(String)
        : [],
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
    placement: normalizePlacementTag(data.placement),
    attachments: Array.isArray(data.attachments)
      ? data.attachments.map(String)
      : [],
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
  placement: PlacementTag | null;
  body: string;
}

function serialize(
  input: MeetingInput,
  slug: string,
  attachments: string[]
): string {
  const tags = input.tags.length ? `[${input.tags.join(", ")}]` : "[]";
  const attachYaml = attachments.length ? `[${attachments.join(", ")}]` : "[]";
  return [
    "---",
    `title: ${input.title || "Untitled meeting"}`,
    `meeting: ${input.meeting || ""}`,
    `date: ${input.date}`,
    `project: ${slug}`,
    `tags: ${tags}`,
    ...(input.placement ? [`placement: ${input.placement}`] : []),
    `attachments: ${attachYaml}`,
    "---",
    "",
    input.body.trim(),
    "",
  ].join("\n");
}

/** Sanitize a user-supplied attachment filename to a safe basename. */
function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || `file-${cryptoRandomId()}`;
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
    placement: normalizePlacementTag(input.placement),
    body: input.body ?? "",
  };
  await fs.writeFile(
    path.join(meetingsDir(slug), `${id}.md`),
    serialize(full, slug, [])
  );
  return { id, ...full, body: full.body.trim(), attachments: [] };
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
    placement:
      input.placement !== undefined
        ? normalizePlacementTag(input.placement)
        : existing.placement,
    body: input.body ?? existing.body,
  };
  // Attachments are managed only via add/removeMeetingAttachment (a separate
  // multipart endpoint), never through this text autosave — so preserve
  // whatever the file already has.
  await fs.writeFile(
    path.join(meetingsDir(slug), `${id}.md`),
    serialize(full, slug, existing.attachments)
  );
  return { id, ...full, body: full.body.trim(), attachments: existing.attachments };
}

/**
 * Save one uploaded attachment for a meeting and add it to the frontmatter list.
 * The stored filename is prefixed with the meeting id (and de-duplicated), so a
 * given attachment belongs to exactly one meeting.
 */
export async function addMeetingAttachment(
  slug: string,
  id: string,
  file: { filename: string; bytes: Buffer }
): Promise<Meeting | null> {
  const existing = await readMeeting(slug, id);
  if (!existing) return null;
  await fs.mkdir(attachmentsDir(slug), { recursive: true });

  let fname = `${id}-${safeFilename(file.filename)}`;
  let k = 2;
  while (await exists(path.join(attachmentsDir(slug), fname))) {
    fname = `${id}-${k++}-${safeFilename(file.filename)}`;
  }
  await fs.writeFile(path.join(attachmentsDir(slug), fname), file.bytes);

  const attachments = [...existing.attachments, fname];
  await fs.writeFile(
    path.join(meetingsDir(slug), `${id}.md`),
    serialize(existing, slug, attachments)
  );
  return { ...existing, attachments };
}

/**
 * Remove an attachment from a meeting and delete the file if nothing else
 * references it. Returns the updated meeting, or null if the meeting is gone.
 */
export async function removeMeetingAttachment(
  slug: string,
  id: string,
  filename: string
): Promise<Meeting | null> {
  const existing = await readMeeting(slug, id);
  if (!existing) return null;
  const attachments = existing.attachments.filter((a) => a !== filename);
  await fs.writeFile(
    path.join(meetingsDir(slug), `${id}.md`),
    serialize(existing, slug, attachments)
  );
  await removeOrphans(slug, [filename], id);
  return { ...existing, attachments };
}

export async function deleteMeeting(
  slug: string,
  id: string
): Promise<{ removedAttachments: string[] } | null> {
  const meeting = await readMeeting(slug, id);
  if (!meeting) return null;
  await fs.unlink(path.join(meetingsDir(slug), `${id}.md`)).catch(() => {});
  const removed = await removeOrphans(slug, meeting.attachments, id);
  return { removedAttachments: removed };
}

/**
 * Is `filename` referenced by any meeting OTHER than `exceptId`? Meeting
 * attachments are id-prefixed so they belong to a single meeting, but scan
 * anyway to stay safe against manual edits.
 */
async function isReferenced(
  slug: string,
  filename: string,
  exceptId: string
): Promise<boolean> {
  const dir = meetingsDir(slug);
  if (!(await exists(dir))) return false;
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    if (f.replace(/\.md$/, "") === exceptId) continue;
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const { data, content } = matter(raw);
    const listed =
      Array.isArray(data.attachments) &&
      data.attachments.map(String).includes(filename);
    if (listed || content.includes(filename)) return true;
  }
  return false;
}

/** Delete each file not referenced by any meeting except `exceptId`. */
async function removeOrphans(
  slug: string,
  files: string[],
  exceptId: string
): Promise<string[]> {
  const removed: string[] = [];
  for (const f of files) {
    if (path.basename(f) !== f) continue; // only touch plain basenames
    if (await isReferenced(slug, f, exceptId)) continue;
    try {
      await fs.unlink(path.join(attachmentsDir(slug), f));
      removed.push(f);
    } catch {
      // already gone — ignore
    }
  }
  return removed;
}
