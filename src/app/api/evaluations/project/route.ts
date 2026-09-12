import { NextResponse } from "next/server";
import { readProjectEval, saveProjectEval, type ProjectEval } from "@/lib/evaluations";
import { commitAll } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  return NextResponse.json(await readProjectEval(project));
}

// Upsert the whole project-level evaluation — debounced autosave.
export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = (await req.json()) as ProjectEval;
  const data = await saveProjectEval(project, body ?? {});
  const hash = await commitAll(project, `eval: update project-level`);
  return NextResponse.json({ ...data, commit: hash });
}
