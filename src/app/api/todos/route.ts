import { NextResponse } from "next/server";
import { readTodos, writeTodos, type TodosFile } from "@/lib/todos";
import { commitAll } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-project write mutex. todos.json is a single shared file, so a burst of
 * concurrent writes (e.g. several soft-deletes finalizing at once on navigate/
 * reload) would otherwise race: each reads the file, removes its own item, and
 * writes the whole list back — last write wins and the others reappear. Chaining
 * every write+commit for a project through one promise serializes them so each
 * sees the previous one's result.
 */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Keep the chain alive but never let a rejection break the next link.
  locks.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  return NextResponse.json(await readTodos(project));
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = (await req.json()) as TodosFile;
  const todos: TodosFile = {
    items: Array.isArray(body?.items) ? body.items : [],
  };
  const hash = await withLock(project, async () => {
    await writeTodos(project, todos);
    return commitAll(project, `todos: update (${todos.items.length} items)`);
  });
  return NextResponse.json({ ok: true, commit: hash });
}

/**
 * Delete a single todo by id, atomically. The read-filter-write-commit runs
 * inside the per-project lock so simultaneous deletes each build on the prior
 * result instead of clobbering it. Idempotent: deleting a missing id is a no-op.
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const id = searchParams.get("id");
  if (!project || !id) {
    return NextResponse.json(
      { error: "project and id are required" },
      { status: 400 }
    );
  }
  const result = await withLock(project, async () => {
    const cur = await readTodos(project);
    const next = cur.items.filter((x) => x.id !== id);
    if (next.length === cur.items.length) {
      return { removed: false, commit: null as string | null };
    }
    await writeTodos(project, { items: next });
    const commit = await commitAll(
      project,
      `todos: delete ${id} (${next.length} items)`
    );
    return { removed: true, commit };
  });
  return NextResponse.json({ ok: true, ...result });
}
