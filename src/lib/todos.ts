import fs from "node:fs/promises";
import { todosFile, exists } from "./paths";

import type { PlacementTag } from "./placement-tag";

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  due: string | null; // YYYY-MM-DD or null
  createdAt: string;
  placement?: PlacementTag; // optional within-project placement tag
}

/**
 * Storage is a FLAT list. The bucket a todo belongs to (Today / This Week /
 * Later) is never stored — it's always computed live from `due` + the current
 * date (see lib/todo-buckets.ts), so re-bucketing on date change is automatic.
 */
export interface TodosFile {
  items: Todo[];
}

export function emptyTodos(): TodosFile {
  return { items: [] };
}

export async function readTodos(slug: string): Promise<TodosFile> {
  const file = todosFile(slug);
  if (!(await exists(file))) return emptyTodos();
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (Array.isArray(parsed?.items)) {
      return { items: parsed.items.filter(Boolean) };
    }
    // Migrate the old bucketed shape {today,week,later} -> flat items.
    // The stored bucket is dropped on purpose; it's recomputed from `due`.
    if (parsed && (parsed.today || parsed.week || parsed.later)) {
      const items = [
        ...(parsed.today ?? []),
        ...(parsed.week ?? []),
        ...(parsed.later ?? []),
      ].filter(Boolean);
      return { items };
    }
    return emptyTodos();
  } catch {
    return emptyTodos();
  }
}

export async function writeTodos(slug: string, todos: TodosFile): Promise<void> {
  await fs.writeFile(
    todosFile(slug),
    JSON.stringify({ items: todos.items ?? [] }, null, 2)
  );
}
