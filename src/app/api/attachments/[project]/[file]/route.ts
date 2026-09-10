import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { attachmentsDir, exists } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ project: string; file: string }> }
) {
  const { project, file } = await params;

  // Prevent path traversal: only allow a plain basename inside the project's
  // attachments folder.
  const safe = path.basename(decodeURIComponent(file));
  const full = path.join(attachmentsDir(project), safe);
  if (!full.startsWith(attachmentsDir(project))) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  if (!(await exists(full))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const bytes = await fs.readFile(full);
  const ext = path.extname(safe).toLowerCase();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}
