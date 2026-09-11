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
  const m = await createMeeting(project, body);
  const hash = await commitAll(
    project,
    `meeting: ${m.id}${m.meeting ? ` (${m.meeting})` : ""}`
  );
  return NextResponse.json({ ...m, commit: hash }, { status: 201 });
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
  const m = await updateMeeting(project, id, body);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `meeting: edit ${m.id}`);
  return NextResponse.json({ ...m, commit: hash });
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
  const ok = await deleteMeeting(project, id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `meeting: delete ${id}`);
  return NextResponse.json({ ok: true, commit: hash });
}
