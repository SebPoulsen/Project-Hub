import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readSettings());
}

export async function PUT(req: Request) {
  const patch = await req.json();
  const next = await writeSettings(patch);
  return NextResponse.json(next);
}
