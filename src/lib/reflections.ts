import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  reflectionsDir,
  reflectionFile,
  exists,
} from "./paths";
import { normalizePlacementTag, type PlacementTag } from "./placement-tag";
import { toMarkdown } from "./frontmatter";

export interface ReflectionData {
  noticed: string;
  learned: string;
  clearer: string;
  notes: string;
  tags: string[];
  /** Research-question ids this reflection is tagged to (see lib/research.ts). */
  research: string[];
  /** Optional within-project placement tag. */
  placement: PlacementTag | null;
}

export interface ReflectionMeta {
  date: string;
  project: string;
}

type TextKey = "noticed" | "learned" | "clearer" | "notes";

const SECTIONS: { key: TextKey; heading: string }[] = [
  { key: "noticed", heading: "What did you notice today?" },
  { key: "learned", heading: "What did you learn today?" },
  { key: "clearer", heading: "What became clearer today?" },
  { key: "notes", heading: "Notes" },
];

/** Build the Markdown-with-frontmatter representation of a reflection. */
export function serializeReflection(
  data: ReflectionData,
  meta: ReflectionMeta
): string {
  const bodyLines: string[] = [];
  for (const s of SECTIONS) {
    bodyLines.push(`## ${s.heading}`, "", (data[s.key] as string)?.trim() ?? "", "");
  }
  return toMarkdown(
    {
      date: meta.date,
      project: meta.project,
      tags: data.tags ?? [],
      research: data.research ?? [],
      ...(data.placement ? { placement: data.placement } : {}),
    },
    bodyLines.join("\n")
  );
}

/**
 * Parse a reflection file back into structured fields by its stable headings.
 *
 * Line-based rather than regex-based: we walk the body, switch the "current
 * section" whenever a line is one of our known `## Heading`s, and collect the
 * lines in between. This stays correct when a prompt is left empty (a regex
 * approach using `\s*\n` would swallow the blank lines and mis-capture the
 * following heading into the empty section).
 */
export function parseReflection(raw: string): ReflectionData {
  let content: string;
  let data: Record<string, unknown>;
  try {
    ({ content, data } = matter(raw) as { content: string; data: Record<string, unknown> });
  } catch (e) {
    // Unparseable frontmatter — recover the body text (sections) and drop the
    // broken frontmatter rather than throwing (which would 500 the page).
    console.warn(`parseReflection: unparseable frontmatter: ${(e as Error).message}`);
    content = raw.replace(/^---[\s\S]*?\n---\n?/, "");
    data = {};
  }
  const result: ReflectionData = {
    noticed: "",
    learned: "",
    clearer: "",
    notes: "",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    research: Array.isArray(data.research) ? data.research.map(String) : [],
    placement: normalizePlacementTag(data.placement),
  };

  const headingToKey = new Map(SECTIONS.map((s) => [s.heading, s.key]));
  const buffers: Partial<Record<keyof ReflectionData, string[]>> = {};
  let current: keyof ReflectionData | null = null;

  for (const line of content.split("\n")) {
    const m = line.match(/^##\s+(.*?)\s*$/);
    if (m && headingToKey.has(m[1])) {
      current = headingToKey.get(m[1])!;
      buffers[current] = [];
      continue;
    }
    if (current) buffers[current]!.push(line);
  }

  for (const s of SECTIONS) {
    const lines = buffers[s.key];
    if (lines) result[s.key] = lines.join("\n").trim();
  }
  return result;
}

export async function readReflection(
  slug: string,
  date: string
): Promise<ReflectionData | null> {
  const file = reflectionFile(slug, date);
  if (!(await exists(file))) return null;
  return parseReflection(await fs.readFile(file, "utf8"));
}

export async function writeReflection(
  slug: string,
  date: string,
  data: ReflectionData
): Promise<void> {
  await fs.mkdir(reflectionsDir(slug), { recursive: true });
  const md = serializeReflection(data, { date, project: slug });
  await fs.writeFile(reflectionFile(slug, date), md);
}

/** Delete a reflection file for a date. Reflections don't share attachments,
 *  so there's no orphan cleanup to do. No-op if the file doesn't exist. */
export async function deleteReflection(
  slug: string,
  date: string
): Promise<boolean> {
  const file = reflectionFile(slug, date);
  if (!(await exists(file))) return false;
  await fs.unlink(file);
  return true;
}

/** Read every reflection for a project, oldest-first (for "Copy all"). */
export async function readAllReflections(
  slug: string
): Promise<{ date: string; data: ReflectionData }[]> {
  const dates = (await listReflectionDates(slug)).slice().sort(); // oldest -> newest
  const out: { date: string; data: ReflectionData }[] = [];
  for (const date of dates) {
    const data = await readReflection(slug, date);
    if (data) out.push({ date, data });
  }
  return out;
}

/**
 * List each reflection's date + placement tag (newest first), for the
 * reflections index filter. Reads only frontmatter of each file.
 */
export async function listReflectionMeta(
  slug: string
): Promise<{ date: string; placement: PlacementTag | null }[]> {
  const dir = reflectionsDir(slug);
  if (!(await exists(dir))) return [];
  const files = (await fs.readdir(dir))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  const out: { date: string; placement: PlacementTag | null }[] = [];
  for (const f of files) {
    let placement: PlacementTag | null = null;
    try {
      const { data } = matter(await fs.readFile(path.join(dir, f), "utf8"));
      placement = normalizePlacementTag(data.placement);
    } catch (e) {
      // Keep the entry (its date is the filename) but drop the unreadable tag.
      console.warn(`listReflectionMeta: unparseable ${f}: ${(e as Error).message}`);
    }
    out.push({ date: f.replace(/\.md$/, ""), placement });
  }
  return out;
}

/** List all reflection dates (newest first) for the calendar / index views. */
export async function listReflectionDates(slug: string): Promise<string[]> {
  const dir = reflectionsDir(slug);
  if (!(await exists(dir))) return [];
  const files = await fs.readdir(dir);
  return files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ""))
    .sort()
    .reverse();
}
