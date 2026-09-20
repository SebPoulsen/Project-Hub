/**
 * Helpers for the "Copy all" exports — turning an entry's machine tags
 * (research-question ids, a placement code) into one natural-language line a
 * person or an AI can read when handed the copied text for report-writing.
 *
 * Pure module (no node deps) so client pages can import it.
 */
import { PLACEMENT_LABEL, type PlacementTag } from "./placement-tag";
import type { ResearchQuestion } from "./research";

/**
 * Map every taggable research id to a readable label: an overarching question
 * by its text, a sub-question as "Question → Sub-question" so a narrowed tag
 * still makes sense out of context.
 */
export function buildResearchLabels(
  items: ResearchQuestion[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const q of items ?? []) {
    map[q.id] = q.question;
    for (const g of q.groups ?? []) {
      for (const s of g.subQuestions ?? []) {
        map[s.id] = `${q.question} → ${s.question}`;
      }
    }
  }
  return map;
}

/**
 * A single readable line summarizing an entry's research tag(s) and placement,
 * e.g. "Tagged: How do users decide to trust a new brand? → Does a round price
 * read as less trustworthy? · Primary". Research ids that don't resolve (a
 * since-deleted question) are dropped. Returns null when there's nothing to
 * show, so callers can omit the line entirely.
 */
export function formatTagLine(opts: {
  research?: string[];
  placement?: PlacementTag | null;
  labels?: Record<string, string>;
}): string | null {
  const labels = opts.labels ?? {};
  const research = (opts.research ?? [])
    .map((id) => labels[id])
    .filter((s): s is string => Boolean(s));
  const placement = opts.placement ? PLACEMENT_LABEL[opts.placement] : null;

  if (research.length && placement) {
    return `Tagged: ${research.join("; ")} · ${placement}`;
  }
  if (research.length) {
    return `Tagged: ${research.join("; ")}`;
  }
  if (placement) {
    return `Placement: ${placement}`;
  }
  return null;
}
