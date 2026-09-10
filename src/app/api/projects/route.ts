import { NextResponse } from "next/server";
import { listProjects, createProject, deleteProject } from "@/lib/projects";
import { readSettings, writeSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listProjects());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const withExamples = body?.withExamples !== false; // default: template with examples
  const project = await createProject(name, withExamples);
  await writeSettings({ lastProject: project.slug });
  return NextResponse.json(project, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  const ok = await deleteProject(slug);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  // If the deleted project was the last-open one, point settings elsewhere.
  const settings = await readSettings();
  if (settings.lastProject === slug) {
    const remaining = await listProjects();
    await writeSettings({ lastProject: remaining[0]?.slug ?? null });
  }
  return NextResponse.json({ ok: true });
}
