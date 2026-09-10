import fs from "node:fs/promises";
import matter from "gray-matter";
import {
  reflectionsDir,
  reflectionFile,
  exists,
} from "./paths";

export interface ReflectionData {
  noticed: string;
  learned: string;
  clearer: string;
  notes: string;
  tags: string[];
}

export interface ReflectionMeta {
  date: string;
  project: string;
}

const SECTIONS: { key: keyof ReflectionData; heading: string }[] = [
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
  const tags = data.tags?.length ? `[${data.tags.join(", ")}]` : "[]";
  const lines = [
    "---",
    `date: ${meta.date}`,
    `project: ${meta.project}`,
    `tags: ${tags}`,
    "---",
    "",
  ];
  for (const s of SECTIONS) {
    lines.push(`## ${s.heading}`, "", (data[s.key] as string)?.trim() ?? "", "");
  }
  return lines.join("\n");
}

/** Parse a reflection file back into structured fields by its stable headings. */
export function parseReflection(raw: string): ReflectionData {
  const { content, data } = matter(raw);
  const result: ReflectionData = {
    noticed: "",
    learned: "",
    clearer: "",
    notes: "",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
  };
  for (const s of SECTIONS) {
    const escaped = s.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
    const m = content.match(re);
    if (m) result[s.key] = m[1].trim();
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
