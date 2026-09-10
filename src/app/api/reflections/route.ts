import { NextResponse } from "next/server";
import {
  readReflection,
  writeReflection,
  listReflectionDates,
  readAllReflections,
  deleteReflection,
  type ReflectionData,
} from "@/lib/reflections";
import { commitAll } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoDate(d: string | null): string {
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  if (searchParams.get("all")) {
    // Full content of every reflection, oldest-first (for "Copy all").
    return NextResponse.json({ entries: await readAllReflections(project) });
  }
  const date = searchParams.get("date");
  if (date) {
    const data = await readReflection(project, isoDate(date));
    return NextResponse.json({ date: isoDate(date), data });
  }
  // No date -> return the list of dates that have reflections.
  return NextResponse.json({ dates: await listReflectionDates(project) });
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = await req.json();
  const date = isoDate(body?.date ?? searchParams.get("date"));
  const data: ReflectionData = {
    noticed: String(body?.noticed ?? ""),
    learned: String(body?.learned ?? ""),
    clearer: String(body?.clearer ?? ""),
    notes: String(body?.notes ?? ""),
    tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
  };
  await writeReflection(project, date, data);

  // One coarse commit per save (the client debounces saves; this is never
  // called per keystroke). Message names which fields have content.
  const filled = (["noticed", "learned", "clearer", "notes"] as const).filter(
    (k) => data[k].trim()
  );
  const hash = await commitAll(
    project,
    `reflection: ${date}${filled.length ? ` (${filled.join(", ")})` : ""}`
  );
  return NextResponse.json({ ok: true, date, commit: hash });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const date = searchParams.get("date");
  if (!project || !date) {
    return NextResponse.json(
      { error: "project and date are required" },
      { status: 400 }
    );
  }
  const removed = await deleteReflection(project, date);
  if (!removed) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `reflection: delete ${date}`);
  return NextResponse.json({ ok: true, commit: hash });
}
