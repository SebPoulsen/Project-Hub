import { NextResponse } from "next/server";
import {
  readResearch,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  collectFindings,
} from "@/lib/research";
import { commitAll } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const [{ items }, findings] = await Promise.all([
    readResearch(project),
    collectFindings(project),
  ]);
  return NextResponse.json({ items, findings });
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = await req.json();
  const q = await createQuestion(project, {
    question: String(body?.question ?? ""),
    detail: String(body?.detail ?? ""),
    placement: body?.placement,
  });
  const hash = await commitAll(project, `research: add "${q.question}"`);
  return NextResponse.json({ ...q, commit: hash }, { status: 201 });
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
  const body = await req.json();
  const patch: {
    question?: string;
    detail?: string;
    status?: "open" | "answered";
    placement?: unknown;
  } = {};
  if (body?.question !== undefined) patch.question = String(body.question);
  if (body?.detail !== undefined) patch.detail = String(body.detail);
  if (body?.status === "open" || body?.status === "answered") {
    patch.status = body.status;
  }
  if (body?.placement !== undefined) patch.placement = body.placement;
  const q = await updateQuestion(project, id, patch);
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `research: edit "${q.question}"`);
  return NextResponse.json({ ...q, commit: hash });
}

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
  const result = await deleteQuestion(project, id);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(
    project,
    `research: delete ${id}${result.scrubbed ? ` (-${result.scrubbed} ref${result.scrubbed > 1 ? "s" : ""})` : ""}`
  );
  return NextResponse.json({ ok: true, ...result, commit: hash });
}
