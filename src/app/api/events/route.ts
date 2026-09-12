import { NextResponse } from "next/server";
import {
  readEvents,
  writeEvents,
  createEvent,
  updateEvent,
  type EventInput,
} from "@/lib/events";
import { commitAll } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-project write mutex. events.json is a single shared file, so a burst of
 * concurrent writes (e.g. several soft-deletes finalizing at once on navigate/
 * reload) would otherwise race: each reads the file, removes its own item, and
 * writes the whole list back — last write wins and the others reappear. Chaining
 * every write+commit for a project through one promise serializes them. Same
 * pattern as the todos route.
 */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
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
  return NextResponse.json(await readEvents(project));
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = (await req.json()) as Partial<EventInput>;
  const result = await withLock(project, async () => {
    const event = await createEvent(project, body);
    const commit = await commitAll(project, `event: add "${event.title}"`);
    return { event, commit };
  });
  return NextResponse.json(
    { ...result.event, commit: result.commit },
    { status: 201 }
  );
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const id = searchParams.get("id");
  if (!project || !id) {
    return NextResponse.json(
      { error: "project and id are required" },
      { status: 400 }
    );
  }
  const body = (await req.json()) as Partial<EventInput>;
  const result = await withLock(project, async () => {
    const event = await updateEvent(project, id, body);
    if (!event) return null;
    const commit = await commitAll(project, `event: edit "${event.title}"`);
    return { event, commit };
  });
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...result.event, commit: result.commit });
}

/**
 * Delete a single event by id, atomically. The read-filter-write-commit runs
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
    const cur = await readEvents(project);
    const next = cur.items.filter((x) => x.id !== id);
    if (next.length === cur.items.length) {
      return { removed: false, commit: null as string | null };
    }
    await writeEvents(project, { items: next });
    const commit = await commitAll(project, `event: delete ${id}`);
    return { removed: true, commit };
  });
  return NextResponse.json({ ok: true, ...result });
}
