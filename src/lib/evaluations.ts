import fs from "node:fs/promises";
import { individualEvalFile, projectEvalFile, evaluationsDir, exists } from "./paths";
import { cryptoRandomId } from "./projects";
import {
  emptyIndividual,
  mergeItems,
  normalizeSet,
  PROJECT_ROWS,
  normalizeProjectRows,
  normalizeProjectSet,
  type IndividualEval,
  type EvalSet,
  type ProjectEvalFile,
  type ProjectEvalSet,
  type ProjectRows,
} from "./evaluations-shared";

// Re-export the pure API so server callers can import everything from here.
export * from "./evaluations-shared";

/* ------------------------------ Individual ------------------------------ */

export async function readIndividual(slug: string): Promise<IndividualEval> {
  const file = individualEvalFile(slug);
  if (!(await exists(file))) return emptyIndividual();
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      goal: String(raw.goal ?? ""),
      items: mergeItems(raw.items),
      sets: Array.isArray(raw.sets)
        ? (raw.sets.map(normalizeSet).filter(Boolean) as EvalSet[])
        : [],
    };
  } catch {
    return emptyIndividual();
  }
}

async function writeIndividual(slug: string, data: IndividualEval): Promise<void> {
  await fs.mkdir(evaluationsDir(slug), { recursive: true });
  await fs.writeFile(individualEvalFile(slug), JSON.stringify(data, null, 2));
}

/**
 * Per-project write mutex. individual.json is one shared file mutated by the
 * setup autosave AND by set create/edit/delete, so a debounced autosave firing
 * mid-way through a set save would otherwise clobber it (last write wins).
 * Chaining every mutation through one promise serializes them.
 */
const locks = new Map<string, Promise<unknown>>();
async function mutateIndividual<T>(
  slug: string,
  fn: (data: IndividualEval) => T
): Promise<T> {
  const prev = locks.get(slug) ?? Promise.resolve();
  const run = prev.then(async () => {
    const cur = await readIndividual(slug);
    const result = fn(cur);
    await writeIndividual(slug, cur);
    return result;
  });
  locks.set(slug, run.then(() => undefined, () => undefined));
  return run;
}

/** Upsert the setup (goal + item labels), preserving existing sets. */
export async function saveIndividualSetup(
  slug: string,
  input: { goal: string; items: { id: string; label: string }[] }
): Promise<IndividualEval> {
  return mutateIndividual(slug, (cur) => {
    cur.goal = input.goal ?? "";
    cur.items = mergeItems(input.items);
    return { ...cur };
  });
}

export async function createEvalSet(
  slug: string,
  input: { name: string; ratings: Record<string, number>; reflections?: unknown }
): Promise<EvalSet> {
  return mutateIndividual(slug, (cur) => {
    const set = normalizeSet({
      id: `ev-${cryptoRandomId()}`,
      name: input.name,
      ratings: input.ratings,
      reflections: input.reflections,
      createdAt: new Date().toISOString(),
    })!;
    cur.sets.push(set);
    return set;
  });
}

export async function updateEvalSet(
  slug: string,
  setId: string,
  input: { name?: string; ratings?: Record<string, number>; reflections?: unknown }
): Promise<EvalSet | null> {
  return mutateIndividual(slug, (cur) => {
    const existing = cur.sets.find((s) => s.id === setId);
    if (!existing) return null;
    const merged = normalizeSet({
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.ratings !== undefined ? { ratings: input.ratings } : {}),
      ...(input.reflections !== undefined ? { reflections: input.reflections } : {}),
    })!;
    merged.id = setId;
    merged.createdAt = existing.createdAt;
    cur.sets = cur.sets.map((s) => (s.id === setId ? merged : s));
    return merged;
  });
}

export async function deleteEvalSet(slug: string, setId: string): Promise<boolean> {
  return mutateIndividual(slug, (cur) => {
    const next = cur.sets.filter((s) => s.id !== setId);
    if (next.length === cur.sets.length) return false;
    cur.sets = next;
    return true;
  });
}

/* ---------------------------- Project-level ----------------------------- */

export async function readProjectEvals(slug: string): Promise<ProjectEvalFile> {
  const file = projectEvalFile(slug);
  if (!(await exists(file))) return { sets: [] };
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    if (Array.isArray(raw?.sets)) {
      return { sets: raw.sets.map(normalizeProjectSet) };
    }
    // Migrate the old single-pass shape ({ scope: {rating,text}, … }) into a
    // first named set, preserving the values. Deterministic id so it stays
    // stable across reads until a write persists the new shape.
    const isLegacy = PROJECT_ROWS.some((r) => raw && typeof raw[r.key] === "object");
    if (isLegacy) {
      return {
        sets: [
          {
            id: "initial",
            name: "Initial",
            rows: normalizeProjectRows(raw),
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
    return { sets: [] };
  } catch {
    return { sets: [] };
  }
}

async function writeProjectEvals(slug: string, data: ProjectEvalFile): Promise<void> {
  await fs.mkdir(evaluationsDir(slug), { recursive: true });
  await fs.writeFile(projectEvalFile(slug), JSON.stringify(data, null, 2));
}

const projectLocks = new Map<string, Promise<unknown>>();
async function mutateProjectEvals<T>(
  slug: string,
  fn: (data: ProjectEvalFile) => T
): Promise<T> {
  const prev = projectLocks.get(slug) ?? Promise.resolve();
  const run = prev.then(async () => {
    const cur = await readProjectEvals(slug);
    const result = fn(cur);
    await writeProjectEvals(slug, cur);
    return result;
  });
  projectLocks.set(slug, run.then(() => undefined, () => undefined));
  return run;
}

export async function createProjectSet(
  slug: string,
  input: { name: string; rows?: ProjectRows }
): Promise<ProjectEvalSet> {
  return mutateProjectEvals(slug, (cur) => {
    const set = normalizeProjectSet({
      id: `pe-${cryptoRandomId()}`,
      name: input.name,
      rows: input.rows,
      createdAt: new Date().toISOString(),
    });
    cur.sets.push(set);
    return set;
  });
}

export async function updateProjectSet(
  slug: string,
  setId: string,
  input: { name?: string; rows?: ProjectRows }
): Promise<ProjectEvalSet | null> {
  return mutateProjectEvals(slug, (cur) => {
    const existing = cur.sets.find((s) => s.id === setId);
    if (!existing) return null;
    const merged = normalizeProjectSet({
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.rows !== undefined ? { rows: input.rows } : {}),
    });
    merged.id = setId;
    merged.createdAt = existing.createdAt;
    cur.sets = cur.sets.map((s) => (s.id === setId ? merged : s));
    return merged;
  });
}

export async function deleteProjectSet(slug: string, setId: string): Promise<boolean> {
  return mutateProjectEvals(slug, (cur) => {
    const next = cur.sets.filter((s) => s.id !== setId);
    if (next.length === cur.sets.length) return false;
    cur.sets = next;
    return true;
  });
}
