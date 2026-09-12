/**
 * Pure evaluation types + helpers (no node/fs imports) so client components can
 * import them without pulling server-only code into the browser bundle.
 * lib/evaluations.ts re-exports these and adds file I/O + CRUD.
 */

/* ------------------------------ Individual ------------------------------ */

export type EvalCategory = "skill" | "knowledge" | "attitude" | "wildcard";

export const CATEGORY_LABEL: Record<EvalCategory, string> = {
  skill: "Skill",
  knowledge: "Knowledge",
  attitude: "Attitude",
  wildcard: "Wild card",
};

/** 14 fixed slots (4/4/4/2) with DETERMINISTIC, stable ids. */
export const ITEM_SLOTS: { id: string; category: EvalCategory }[] = [
  { id: "sk1", category: "skill" },
  { id: "sk2", category: "skill" },
  { id: "sk3", category: "skill" },
  { id: "sk4", category: "skill" },
  { id: "kn1", category: "knowledge" },
  { id: "kn2", category: "knowledge" },
  { id: "kn3", category: "knowledge" },
  { id: "kn4", category: "knowledge" },
  { id: "at1", category: "attitude" },
  { id: "at2", category: "attitude" },
  { id: "at3", category: "attitude" },
  { id: "at4", category: "attitude" },
  { id: "wc1", category: "wildcard" },
  { id: "wc2", category: "wildcard" },
];

export interface EvalItem {
  id: string;
  category: EvalCategory;
  label: string;
}

/** The three optional worksheet reflection prompts, per evaluation set. */
export interface EvalReflections {
  gap: string;
  steps: string;
  edge: string;
}

export const REFLECTION_PROMPTS: { key: keyof EvalReflections; label: string }[] = [
  { key: "gap", label: "Where’s the gap? What SKAs will you grow?" },
  { key: "steps", label: "What are your steps to grow / close the gap?" },
  { key: "edge", label: "What’s your learning edge?" },
];

export function emptyReflections(): EvalReflections {
  return { gap: "", steps: "", edge: "" };
}

export interface EvalSet {
  id: string;
  name: string;
  ratings: Record<string, number>; // itemId -> 1..10
  reflections: EvalReflections; // optional free-text, may be blank
  createdAt: string;
}

export interface IndividualEval {
  goal: string;
  items: EvalItem[];
  sets: EvalSet[];
}

export function initItems(): EvalItem[] {
  return ITEM_SLOTS.map((s) => ({ ...s, label: "" }));
}

export function emptyIndividual(): IndividualEval {
  return { goal: "", items: initItems(), sets: [] };
}

/** Rebuild items in fixed slot order, carrying over stored labels by id. */
export function mergeItems(stored: unknown): EvalItem[] {
  const byId = new Map<string, string>();
  if (Array.isArray(stored)) {
    for (const it of stored) {
      if (it && typeof it === "object" && "id" in it) {
        byId.set(String((it as EvalItem).id), String((it as EvalItem).label ?? ""));
      }
    }
  }
  return ITEM_SLOTS.map((s) => ({ ...s, label: byId.get(s.id) ?? "" }));
}

export function coerceRating(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n)));
}

export function normalizeSet(raw: unknown): EvalSet | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ratings: Record<string, number> = {};
  if (r.ratings && typeof r.ratings === "object") {
    for (const [k, v] of Object.entries(r.ratings as Record<string, unknown>)) {
      const cr = coerceRating(v);
      if (cr != null && ITEM_SLOTS.some((s) => s.id === k)) ratings[k] = cr;
    }
  }
  const rf = (r.reflections && typeof r.reflections === "object"
    ? r.reflections
    : {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? `ev-${Math.random().toString(36).slice(2, 10)}`),
    name: String(r.name ?? "").trim() || "Untitled",
    ratings,
    reflections: {
      gap: String(rf.gap ?? ""),
      steps: String(rf.steps ?? ""),
      edge: String(rf.edge ?? ""),
    },
    createdAt: String(r.createdAt ?? new Date().toISOString()),
  };
}

/* ---------------------------- Project-level ----------------------------- */

export const PROJECT_ROWS: { key: string; label: string }[] = [
  { key: "scope", label: "Scope / deliverables met" },
  { key: "researchQuestions", label: "Research question(s) answered" },
  {
    key: "collaboration",
    label: "Effectiveness of the company relationship / collaboration",
  },
  { key: "insights", label: "Insights uncovered from research" },
  { key: "changes", label: "What I’d change if I ran it again" },
];

export interface ProjectEvalRow {
  rating: number | null; // 1..10
  text: string;
}

export type ProjectEval = Record<string, ProjectEvalRow>;

export function emptyProjectEval(): ProjectEval {
  const out: ProjectEval = {};
  for (const r of PROJECT_ROWS) out[r.key] = { rating: null, text: "" };
  return out;
}
