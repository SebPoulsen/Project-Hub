import fs from "node:fs/promises";
import { eventsFile, exists } from "./paths";
import { cryptoRandomId } from "./projects";
import { normalizePlacementTag, type PlacementTag } from "./placement-tag";

/**
 * A calendar event — a genuine scheduled thing (a meeting, a visit, a talk),
 * distinct from to-dos (tasks) and reflections (journal). Stored in a flat
 * `events.json` (parallel to todos.json / companies.json / research.json) as
 * short structured records, so editing one never rewrites project metadata.
 *
 * `companyId` optionally cross-references a company in companies.json — the
 * company *name* is never stored here, it's resolved live from the id (same
 * "derive from source, never hand-store" rule as research findings). A dangling
 * ref (company later deleted) simply renders no company chip; scrubCompanyRef
 * clears it on company delete-finalize.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD, required
  startTime: string | null; // "HH:MM" | null
  endTime: string | null; // "HH:MM" | null
  notes: string;
  companyId: string | null; // optional ref into companies.json
  placement: PlacementTag | null; // optional within-project placement tag
  createdAt: string;
}

export interface EventsFile {
  items: CalendarEvent[];
}

export function emptyEvents(): EventsFile {
  return { items: [] };
}

/** Coerce an arbitrary value into "HH:MM" or null. */
function coerceTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Normalize a raw stored/POSTed record into a well-formed CalendarEvent. */
function normalize(raw: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date.slice(0, 10))
      ? raw.date.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const companyId =
    typeof raw.companyId === "string" && raw.companyId.trim()
      ? raw.companyId.trim()
      : null;
  return {
    id: raw.id,
    title: String(raw.title ?? "").trim() || "Untitled event",
    date,
    startTime: coerceTime(raw.startTime),
    endTime: coerceTime(raw.endTime),
    notes: String(raw.notes ?? "").trim(),
    companyId,
    placement: normalizePlacementTag(raw.placement),
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
}

export async function readEvents(slug: string): Promise<EventsFile> {
  const file = eventsFile(slug);
  if (!(await exists(file))) return emptyEvents();
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (Array.isArray(parsed?.items)) {
      return { items: parsed.items.filter(Boolean).map(normalize) };
    }
    return emptyEvents();
  } catch {
    return emptyEvents();
  }
}

export async function writeEvents(
  slug: string,
  data: EventsFile
): Promise<void> {
  await fs.writeFile(
    eventsFile(slug),
    JSON.stringify({ items: sortEvents(data.items ?? []) }, null, 2)
  );
}

/** Chronological order: by date, then start time (timed before all-day), stable. */
function sortEvents(items: CalendarEvent[]): CalendarEvent[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const at = a.startTime ?? "99:99";
    const bt = b.startTime ?? "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

export type EventInput = Omit<CalendarEvent, "id" | "createdAt">;

export async function createEvent(
  slug: string,
  input: Partial<EventInput>
): Promise<CalendarEvent> {
  const file = await readEvents(slug);
  const event = normalize({ ...input, id: `evt-${cryptoRandomId()}` });
  file.items.push(event);
  await writeEvents(slug, file);
  return event;
}

export async function updateEvent(
  slug: string,
  id: string,
  patch: Partial<EventInput>
): Promise<CalendarEvent | null> {
  const file = await readEvents(slug);
  const idx = file.items.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const merged = normalize({ ...file.items[idx], ...patch, id });
  file.items[idx] = merged;
  await writeEvents(slug, file);
  return merged;
}

export async function deleteEvent(slug: string, id: string): Promise<boolean> {
  const file = await readEvents(slug);
  const next = file.items.filter((e) => e.id !== id);
  if (next.length === file.items.length) return false;
  await writeEvents(slug, { items: next });
  return true;
}

/**
 * Clear a now-deleted company's id from every event that referenced it, so no
 * dangling ref is left behind. Called at company delete-finalize (same timing
 * and intent as scrubResearchRef). Returns the number of events changed.
 */
export async function scrubCompanyRef(
  slug: string,
  companyId: string
): Promise<number> {
  const file = await readEvents(slug);
  let count = 0;
  for (const e of file.items) {
    if (e.companyId === companyId) {
      e.companyId = null;
      count++;
    }
  }
  if (count > 0) await writeEvents(slug, file);
  return count;
}
