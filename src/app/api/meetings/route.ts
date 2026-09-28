import { NextResponse } from "next/server";
import {
  listMeetings,
  readMeeting,
  readAllMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  type MeetingInput,
} from "@/lib/meetings";
import { commitAll } from "@/lib/git";
import { withLock } from "@/lib/lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  if (searchParams.get("all")) {
    return NextResponse.json({ meetings: await readAllMeetings(project) });
  }
  const id = searchParams.get("id");
  if (id) {
    const m = await readMeeting(project, id);
    if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(m);
  }
  return NextResponse.json(await listMeetings(project));
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = (await req.json()) as Partial<MeetingInput>;
  const m = await withLock(project, async () => {
    const created = await createMeeting(project, body);
    const hash = await commitAll(
      project,
      `meeting: ${created.id}${created.meeting ? ` (${created.meeting})` : ""}`
    );
    return { ...created, commit: hash };
  });
  return NextResponse.json(m, { status: 201 });
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
  const body = (await req.json()) as Partial<MeetingInput>;
  const m = await withLock(project, async () => {
    const updated = await updateMeeting(project, id, body);
    if (!updated) return null;
    const hash = await commitAll(project, `meeting: edit ${updated.id}`);
    return { ...updated, commit: hash };
  });
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(m);
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
  const result = await withLock(project, async () => {
    const r = await deleteMeeting(project, id);
    if (!r) return null;
    const removed = r.removedAttachments.length;
    const hash = await commitAll(
      project,
      `meeting: delete ${id}${removed ? ` (-${removed} attachment${removed > 1 ? "s" : ""})` : ""}`
    );
    return { ...r, commit: hash };
  });
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
