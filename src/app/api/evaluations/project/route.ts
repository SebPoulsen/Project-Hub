import { NextResponse } from "next/server";
import {
  readProjectEvals,
  createProjectSet,
  updateProjectSet,
  deleteProjectSet,
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
  return NextResponse.json(await readProjectEvals(project));
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = await req.json();
  const set = await createProjectSet(project, {
    name: String(body?.name ?? ""),
    rows: body?.rows,
  });
  const hash = await commitAll(project, `eval: add project set "${set.name}"`);
  return NextResponse.json({ ...set, commit: hash }, { status: 201 });
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const setId = searchParams.get("setId");
  if (!project || !setId) {
    return NextResponse.json(
      { error: "project and setId are required" },
      { status: 400 }
    );
  }
  const body = await req.json();
  const set = await updateProjectSet(project, setId, {
    name: body?.name,
    rows: body?.rows,
  });
  if (!set) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `eval: edit project set "${set.name}"`);
  return NextResponse.json({ ...set, commit: hash });
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
  const ok = await deleteProjectSet(project, setId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `eval: delete project set ${setId}`);
  return NextResponse.json({ ok: true, commit: hash });
}
