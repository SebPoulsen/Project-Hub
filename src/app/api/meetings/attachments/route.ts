import { NextResponse } from "next/server";
import {
  addMeetingAttachment,
  removeMeetingAttachment,
} from "@/lib/meetings";
import { isPdfAttachment } from "@/lib/attachments";
import { commitAll } from "@/lib/git";
import { withLock } from "@/lib/lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meeting attachments (PDF only, for now). Kept separate from the meeting's text
 * autosave (which is JSON and can't carry file bytes): each add/remove is its
 * own multipart request and its own commit. Writes go through the same
 * per-project lock as the text autosave so the two never clobber the file.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const id = searchParams.get("id");
  if (!project || !id) {
    return NextResponse.json(
      { error: "project and id are required" },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const entry = form.get("file");
  if (!(entry instanceof File) || entry.size === 0) {
    return NextResponse.json({ error: "a file is required" }, { status: 400 });
  }
  // PDF only — enforce by extension and (when present) content type.
  const okType = entry.type === "" || entry.type === "application/pdf";
  if (!isPdfAttachment(entry.name) || !okType) {
    return NextResponse.json(
      { error: "only PDF attachments are supported" },
      { status: 415 }
    );
  }

  const bytes = Buffer.from(await entry.arrayBuffer());
  const result = await withLock(project, async () => {
    const m = await addMeetingAttachment(project, id, {
      filename: entry.name,
      bytes,
    });
    if (!m) return null;
    const hash = await commitAll(project, `meeting: attach PDF to ${id}`);
    return { ...m, commit: hash };
  });
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const id = searchParams.get("id");
  const file = searchParams.get("file");
  if (!project || !id || !file) {
    return NextResponse.json(
      { error: "project, id and file are required" },
      { status: 400 }
    );
  }

  const result = await withLock(project, async () => {
    const m = await removeMeetingAttachment(project, id, file);
    if (!m) return null;
    const hash = await commitAll(project, `meeting: remove attachment from ${id}`);
    return { ...m, commit: hash };
  });
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}
