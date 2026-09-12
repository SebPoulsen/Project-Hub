import { NextResponse } from "next/server";
import {
  listNotes,
  readNote,
  readAllNotes,
  createNote,
  updateNote,
  deleteNote,
} from "@/lib/notes";
import { normalizePlacementTag } from "@/lib/placement-tag";
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
    // Full content of every note, oldest-first (for "Copy all").
    return NextResponse.json({ notes: await readAllNotes(project) });
  }
  const id = searchParams.get("id");
  if (id) {
    const note = await readNote(project, id);
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(note);
  }
  return NextResponse.json(await listNotes(project));
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const form = await req.formData();
  const title = String(form.get("title") ?? "");
  const bodyText = String(form.get("body") ?? "");
  const tagsRaw = String(form.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const research = String(form.get("research") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const attachments: { filename: string; bytes: Buffer }[] = [];
  for (const entry of form.getAll("files")) {
    if (entry instanceof File && entry.size > 0) {
      const buf = Buffer.from(await entry.arrayBuffer());
      attachments.push({ filename: entry.name, bytes: buf });
    }
  }

  const note = await createNote(project, {
    title,
    body: bodyText,
    tags,
    research,
    placement: normalizePlacementTag(form.get("placement")),
    attachments,
  });
  const hash = await commitAll(
    project,
    `note: ${note.id}${attachments.length ? ` (+${attachments.length} attachment${attachments.length > 1 ? "s" : ""})` : ""}`
  );
  return NextResponse.json({ ...note, commit: hash }, { status: 201 });
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

  const form = await req.formData();
  const title = String(form.get("title") ?? "");
  const bodyText = String(form.get("body") ?? "");
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const research = String(form.get("research") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const keepAttachments = String(form.get("keep") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const newAttachments: { filename: string; bytes: Buffer }[] = [];
  for (const entry of form.getAll("files")) {
    if (entry instanceof File && entry.size > 0) {
      newAttachments.push({
        filename: entry.name,
        bytes: Buffer.from(await entry.arrayBuffer()),
      });
    }
  }

  const note = await updateNote(project, id, {
    title,
    body: bodyText,
    tags,
    research,
    placement: normalizePlacementTag(form.get("placement")),
    keepAttachments,
    newAttachments,
  });
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });

  const hash = await commitAll(project, `note: edit ${note.id}`);
  return NextResponse.json({ ...note, commit: hash });
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

  const result = await deleteNote(project, id);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });

  const removed = result.removedAttachments.length;
  const hash = await commitAll(
    project,
    `note: delete ${id}${removed ? ` (-${removed} attachment${removed > 1 ? "s" : ""})` : ""}`
  );
  return NextResponse.json({ ok: true, ...result, commit: hash });
}
