import { NextResponse } from "next/server";
import { readTodos, writeTodos, type Todos } from "@/lib/todos";
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
  const body = (await req.json()) as Todos;
  const todos: Todos = {
    today: Array.isArray(body?.today) ? body.today : [],
    week: Array.isArray(body?.week) ? body.week : [],
    later: Array.isArray(body?.later) ? body.later : [],
  };
  await writeTodos(project, todos);
  const count =
    todos.today.length + todos.week.length + todos.later.length;
  const hash = await commitAll(project, `todos: update (${count} items)`);
  return NextResponse.json({ ok: true, commit: hash });
}
