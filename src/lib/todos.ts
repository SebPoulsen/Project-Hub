import fs from "node:fs/promises";
import { todosFile, exists } from "./paths";

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  due: string | null; // YYYY-MM-DD or null
  createdAt: string;
}

export type Bucket = "today" | "week" | "later";

export interface Todos {
  today: Todo[];
  week: Todo[];
  later: Todo[];
}

export function emptyTodos(): Todos {
  return { today: [], week: [], later: [] };
}

export async function readTodos(slug: string): Promise<Todos> {
  const file = todosFile(slug);
  if (!(await exists(file))) return emptyTodos();
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      today: parsed.today ?? [],
      week: parsed.week ?? [],
      later: parsed.later ?? [],
    };
  } catch {
    return emptyTodos();
  }
}

export async function writeTodos(slug: string, todos: Todos): Promise<void> {
  await fs.writeFile(todosFile(slug), JSON.stringify(todos, null, 2));
}
