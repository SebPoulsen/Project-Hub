import { NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/projects";
import { writeSettings } from "@/lib/settings";

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
