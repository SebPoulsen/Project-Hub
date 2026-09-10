import type { Todo } from "./todos";

export type Bucket = "today" | "week" | "later";

export const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Today",
  week: "This Week",
  later: "Later",
};

/** Local (not UTC) YYYY-MM-DD, to keep date math timezone-correct. */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

/** Sunday (Mon-first week) of the week containing `now`, as YYYY-MM-DD. */
export function weekEndYmd(now: Date): string {
  const offset = (now.getDay() + 6) % 7; // 0 = Monday
  return ymd(addDays(now, 6 - offset));
}

/**
 * The single source of truth for which bucket a todo is in — a pure function of
 * its due date and the current date. Overdue items (due before today) surface in
 * "Today" so a missed deadline is never buried.
 */
export function bucketOf(todo: Todo, now: Date): Bucket {
  if (!todo.due) return "later";
  const t = ymd(now);
  if (todo.due <= t) return "today"; // today or overdue
  if (todo.due <= weekEndYmd(now)) return "week"; // future, within this week
  return "later"; // future, beyond this week
}

// Dated buckets: soonest first, ties broken by creation order (oldest first).
function cmpDated(a: Todo, b: Todo): number {
  return (
    (a.due ?? "").localeCompare(b.due ?? "") ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

// Later: dated items (soonest first) before undated items (oldest added first).
function cmpLater(a: Todo, b: Todo): number {
  const ad = a.due != null;
  const bd = b.due != null;
  if (ad && bd) return cmpDated(a, b);
  if (ad) return -1;
  if (bd) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

/** Group a flat todo list into sorted buckets for the current date. */
export function bucketize(
  todos: Todo[],
  now: Date
): Record<Bucket, Todo[]> {
  const out: Record<Bucket, Todo[]> = { today: [], week: [], later: [] };
  for (const t of todos) out[bucketOf(t, now)].push(t);
  out.today.sort(cmpDated);
  out.week.sort(cmpDated);
  out.later.sort(cmpLater);
  return out;
}

export type DueTone = "overdue" | "today" | "soon" | "muted";

/** A friendly, relative label for a due date (or null for undated). */
export function dueLabel(
  due: string | null,
  now: Date
): { text: string; tone: DueTone } | null {
  if (!due) return null;
  const t = ymd(now);
  const dateObj = new Date(due + "T00:00:00");
  const short = dateObj.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  if (due < t) return { text: short, tone: "overdue" };
  if (due === t) return { text: "Today", tone: "today" };
  if (due === ymd(addDays(now, 1))) return { text: "Tomorrow", tone: "soon" };
  if (due <= weekEndYmd(now)) {
    return {
      text: dateObj.toLocaleDateString(undefined, { weekday: "short" }),
      tone: "soon",
    };
  }
  return { text: short, tone: "muted" };
}
