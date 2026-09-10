import { NextResponse } from "next/server";
import { readTodos, writeTodos, type TodosFile } from "@/lib/todos";
import { commitAll } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  return NextResponse.json(await readTodos(project));
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = (await req.json()) as TodosFile;
  const todos: TodosFile = {
    items: Array.isArray(body?.items) ? body.items : [],
  };
  await writeTodos(project, todos);
  const hash = await commitAll(
    project,
    `todos: update (${todos.items.length} items)`
  );
  return NextResponse.json({ ok: true, commit: hash });
}
