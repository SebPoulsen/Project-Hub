import { NextResponse } from "next/server";
import {
  readCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  type CompanyInput,
} from "@/lib/companies";
import { commitAll } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  return NextResponse.json(await readCompanies(project));
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }
  const body = (await req.json()) as Partial<CompanyInput>;
  const company = await createCompany(project, body);
  const hash = await commitAll(project, `company: add "${company.name}"`);
  return NextResponse.json({ ...company, commit: hash }, { status: 201 });
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
  const body = (await req.json()) as Partial<CompanyInput>;
  const company = await updateCompany(project, id, body);
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `company: edit "${company.name}"`);
  return NextResponse.json({ ...company, commit: hash });
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
  const ok = await deleteCompany(project, id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = await commitAll(project, `company: delete ${id}`);
  return NextResponse.json({ ok: true, commit: hash });
}
