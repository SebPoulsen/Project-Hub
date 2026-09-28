# Project Hub

A **local-first** project companion app. It runs on your Mac, opens in your
browser, and stores everything as **plain files** (Markdown + JSON) inside one
folder in iCloud Drive — so you can open it in any editor, sync it across
devices, or hand the whole folder to Claude in a chat with no export step.

Built with Next.js (one process serves both the UI and the file/git backend).

---

## First-time setup

1. **Install Node.js** (required — not currently on this machine).
   Get the LTS from <https://nodejs.org> (double-click the `.pkg`).
2. **Launch:** double-click `start.command`.
   On first run it installs dependencies, then opens
   <http://localhost:4321> automatically.

To stop the app, press `Ctrl+C` in the terminal window it opened, or just close it.

If you prefer the command line:

```bash
cd ~/Desktop/project-hub
npm install       # first time only
npm run dev       # then open http://localhost:4321
```

---

## Running the app

**The production server on port 4321 is the live app** — the one launched by
`start.command` / `npm start`, serving the build in `.next/`. Treat it and its
`.next/` build folder as untouchable while it is running.

**Rule for any automated/assisted work in this repo (applies to Claude too):**

- **Never stop, kill, or overwrite the running production server (port 4321) or
  its `.next/` build folder.** Running `next dev` or `next build` against the
  default `.next/` clobbers the live build, so don't point dev tooling at it.
- **For browser verification, use a throwaway dev server on a different port
  with its own build directory** — it builds into `.next-dev/` (set via the
  `PROJECTHUB_DISTDIR` env var) and never touches production's `.next/`:

  ```bash
  npm run dev:verify    # next dev on http://localhost:4322, builds into .next-dev/
  ```

- **If production needs a rebuild** (to pick up a change on 4321), that is a
  separate, explicit final step — flag it first, then run `npm run build`
  followed by `npm start`. Never fold it silently into verification.

---

## Where your data lives

```
~/Library/Mobile Documents/com~apple~CloudDocs/ProjectHub/
```

That's iCloud Drive → `ProjectHub`. Each project is its own subfolder **and its
own git repo** (auto-committed on save). See `DATA-SCHEMA.md` for the exact
layout of a project folder.

To move the data elsewhere (e.g. a different synced folder), set an environment
variable before launching:

```bash
export PROJECTHUB_DATA_DIR="/path/to/your/folder"
```

### ⚠️ iCloud + git note

iCloud's **"Optimize Mac Storage"** can offload (evict) files to save space. If
it evicts `.git` internals mid-operation, project history can get flaky. Your
actual content (`.md` / `.json`) always syncs fine — this only affects version
history. Recommended: **System Settings → your name → iCloud → iCloud Drive →
turn off "Optimize Mac Storage"** (or keep the `ProjectHub` folder downloaded).

---

## Backup story (by design, no app code)

- **Sync / backup** = the folder lives in iCloud Drive. That's it.
- **Version history** = each project folder is a git repo. The app runs
  `git init` on create and makes **one commit per save** — never per keystroke.
  Saves are debounced (~1.5s after you stop typing, plus on blur), so history
  stays meaningful (`reflection: 2026-09-10 (noticed, notes)`) instead of 400
  commits titled "update".

To browse history for a project:

```bash
cd "~/Library/Mobile Documents/com~apple~CloudDocs/ProjectHub/<project>"
git log --oneline
```

---

## Phase 1 features (this build)

- Create / switch projects (each from a template with example content)
- Daily reflections — *noticed / learned / became clearer* + freeform notes,
  one Markdown file per day, autosaved
- To-dos — today / this week / later, one JSON file per project
- Notes with photo attachments (images stored in `attachments/`, referenced by
  relative path in the Markdown)
- Calendar view of dated reflections and to-do due dates
- Three color palettes (dark / light / beige), instant switch, saved to
  `settings.json`

Phases 2 (research questions, companies + map, evaluations, "Mind the Gap"
grid) and 3 (learning-arc diagram tool, desktop packaging) are planned but not
in this build.
