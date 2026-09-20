import { NextResponse } from "next/server";
import {
  readResearch,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createGroup,
  updateGroup,
  deleteGroup,
  createSubQuestion,
  updateSubQuestion,
  deleteSubQuestion,
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

  // A titled sub-question group under an overarching question.
  if (body?.type === "group") {
    const g = await createGroup(project, String(body?.rqId ?? ""), {
      title: String(body?.title ?? ""),
    });
    if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });
    const hash = await commitAll(project, `research: add group "${g.title}"`);
    return NextResponse.json({ ...g, commit: hash }, { status: 201 });
  }

  // A sub-question inside a group.
  if (body?.type === "subquestion") {
    const s = await createSubQuestion(
      project,
      String(body?.rqId ?? ""),
      String(body?.groupId ?? ""),
      { question: String(body?.question ?? "") }
    );
    if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
    const hash = await commitAll(project, `research: add sub-question "${s.question}"`);
    return NextResponse.json({ ...s, commit: hash }, { status: 201 });
  }

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
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = await req.json();

  // Rename a sub-question group.
  if (body?.type === "group") {
    const g = await updateGroup(
      project,
      String(body?.rqId ?? ""),
      String(body?.groupId ?? ""),
      { title: body?.title !== undefined ? String(body.title) : undefined }
    );
    if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });
    const hash = await commitAll(project, `research: edit group "${g.title}"`);
    return NextResponse.json({ ...g, commit: hash });
  }

  // Edit a sub-question's text.
  if (body?.type === "subquestion") {
    const s = await updateSubQuestion(
      project,
      String(body?.rqId ?? ""),
      String(body?.groupId ?? ""),
      String(body?.subId ?? ""),
      { question: body?.question !== undefined ? String(body.question) : undefined }
    );
    if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
    const hash = await commitAll(project, `research: edit sub-question "${s.question}"`);
    return NextResponse.json({ ...s, commit: hash });
  }

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
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
  const type = searchParams.get("type");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const refs = (n: number) =>
    n ? ` (-${n} ref${n > 1 ? "s" : ""})` : "";

  // Delete a whole group (and, at finalize, scrub every sub-question's tags).
  if (type === "group") {
    const rqId = searchParams.get("rqId");
    const groupId = searchParams.get("groupId");
    if (!rqId || !groupId) {
      return NextResponse.json(
        { error: "rqId and groupId are required" },
        { status: 400 }
      );
    }
    const result = await deleteGroup(project, rqId, groupId);
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    const hash = await commitAll(
      project,
      `research: delete group ${groupId}${refs(result.scrubbed)}`
    );
    return NextResponse.json({ ok: true, ...result, commit: hash });
  }

  // Delete a single sub-question (scrub its own tag at finalize).
  if (type === "subquestion") {
    const rqId = searchParams.get("rqId");
    const groupId = searchParams.get("groupId");
    const subId = searchParams.get("subId");
    if (!rqId || !groupId || !subId) {
      return NextResponse.json(
        { error: "rqId, groupId and subId are required" },
        { status: 400 }
      );
    }
    const result = await deleteSubQuestion(project, rqId, groupId, subId);
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    const hash = await commitAll(
      project,
      `research: delete sub-question ${subId}${refs(result.scrubbed)}`
    );
    return NextResponse.json({ ok: true, ...result, commit: hash });
  }

  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const result = await deleteQuestion(project, id);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(
    project,
    `research: delete ${id}${refs(result.scrubbed)}`
  );
  return NextResponse.json({ ok: true, ...result, commit: hash });
}
