import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { projectDir } from "./paths";
import { exists } from "./paths";
import path from "node:path";

const run = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (err: any) {
    // git commit exits non-zero when there is nothing to commit; treat that as a no-op.
    const out = `${err?.stdout ?? ""}${err?.stderr ?? ""}`;
    if (/nothing to commit|no changes added/i.test(out)) return "";
    throw err;
  }
}

/**
 * Ensure a project folder is a git repo with a local identity and at least one
 * commit. Safe to call repeatedly. The identity is local to this repo only, so
 * it never touches the user's global git config.
 */
export async function ensureRepo(slug: string): Promise<void> {
  const dir = projectDir(slug);
  if (!(await exists(path.join(dir, ".git")))) {
    await git(dir, ["init"]);
    await git(dir, ["config", "--local", "user.name", "Project Hub"]);
    await git(dir, ["config", "--local", "user.email", "projecthub@localhost"]);
    // Keep line endings sane across devices syncing via iCloud.
    await git(dir, ["config", "--local", "core.autocrlf", "false"]);
  }
}

/**
 * Stage everything in the project folder and make a single commit.
 *
 * Commits are intentionally coarse: callers invoke this once per *save* (a
 * debounced API write), never per keystroke, so history stays meaningful.
 * Returns the new commit hash, or null if there was nothing to commit.
 */
export async function commitAll(slug: string, message: string): Promise<string | null> {
  const dir = projectDir(slug);
  await ensureRepo(slug);
  await git(dir, ["add", "-A"]);
  const status = await git(dir, ["status", "--porcelain"]);
  if (!status) return null; // nothing changed
  await git(dir, ["commit", "-m", message]);
  return await git(dir, ["rev-parse", "HEAD"]);
}
