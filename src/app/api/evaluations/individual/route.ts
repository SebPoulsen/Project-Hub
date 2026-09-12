import { NextResponse } from "next/server";
import {
  readIndividual,
  saveIndividualSetup,
  createEvalSet,
  updateEvalSet,
  deleteEvalSet,
} from "@/lib/evaluations";
import { commitAll } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  return NextResponse.json(await readIndividual(project));
}

// Setup upsert (goal + item labels) — debounced autosave from the client.
export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const setId = searchParams.get("setId");
  const body = await req.json();

  if (setId) {
    const set = await updateEvalSet(project, setId, {
      name: body?.name,
      ratings: body?.ratings,
      reflections: body?.reflections,
    });
    if (!set) return NextResponse.json({ error: "not found" }, { status: 404 });
    const hash = await commitAll(project, `eval: edit set "${set.name}"`);
    return NextResponse.json({ ...set, commit: hash });
  }

  const data = await saveIndividualSetup(project, {
    goal: String(body?.goal ?? ""),
    items: Array.isArray(body?.items) ? body.items : [],
  });
  const hash = await commitAll(project, `eval: update individual setup`);
  return NextResponse.json({ ...data, commit: hash });
}

// Add a new evaluation set.
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = await req.json();
  const set = await createEvalSet(project, {
    name: String(body?.name ?? ""),
    ratings: body?.ratings ?? {},
    reflections: body?.reflections,
  });
  const hash = await commitAll(project, `eval: add set "${set.name}"`);
  return NextResponse.json({ ...set, commit: hash }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const setId = searchParams.get("setId");
  if (!project || !setId) {
    return NextResponse.json(
      { error: "project and setId are required" },
      { status: 400 }
    );
  }
  const ok = await deleteEvalSet(project, setId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `eval: delete set ${setId}`);
  return NextResponse.json({ ok: true, commit: hash });
}
