# Data schema

Everything Project Hub stores is a plain file you can read, edit, sync, and hand
to Claude directly. No database, no export step.

## Data root

```
~/Library/Mobile Documents/com~apple~CloudDocs/ProjectHub/
  settings.json            ← app preferences (theme, last-open project)
  <project-slug>/          ← one folder per project (also a git repo)
  <another-project>/
```

`settings.json`:

```json
{ "theme": "dark", "lastProject": "my-first-project", "createdAt": "2026-09-10T…" }
```

## A single project folder

```
<project-slug>/
  project.json             ← metadata (name, dates, research questions, placement)
  reflections/
    2026-09-10.md          ← one file per day
  todos.json               ← { today: [], week: [], later: [] }
  notes/
    2026-09-10-welcome.md
  attachments/
    2026-09-10-welcome-photo.jpg
  companies.json           ← [] (used in Phase 2)
  evaluations/             ← (used in Phase 2)
  .git/                    ← auto-init, one commit per save
```

### `project.json`

```json
{
  "name": "My First Project",
  "slug": "my-first-project",
  "startDate": "2026-09-10",
  "endDate": null,
  "researchQuestions": [],
  "placement": { "primary": "", "secondary": "" },
  "createdAt": "2026-09-10T…"
}
```

### `reflections/YYYY-MM-DD.md`

YAML frontmatter for machine metadata; the three prompts + notes as body
sections with stable headings (so both humans and Claude read it naturally, and
the app can parse it back into fields):

```markdown
---
date: 2026-09-10
project: my-first-project
tags: [example, setup]
---

## What did you notice today?

…

## What did you learn today?

…

## What became clearer today?

…

## Notes

…
```

### `todos.json`

A **flat** list. The bucket a todo belongs to (Today / This Week / Later) is
**not stored** — it's computed live from `due` and the current date, so items
re-bucket automatically as time passes. Undated items are "Later"; overdue items
surface in "Today".

```json
{
  "items": [
    { "id": "a1b2c3d4", "text": "Write my first reflection", "done": false, "due": "2026-09-10", "createdAt": "…" },
    { "id": "e5f6g7h8", "text": "Plan company visit", "done": false, "due": null, "createdAt": "…" }
  ]
}
```

Older files using the `{ "today": [], "week": [], "later": [] }` shape are read
transparently and migrated to `items` on the next write.

### `notes/<id>.md`

```markdown
---
title: Welcome to Project Hub
date: 2026-09-10
project: my-first-project
tags: [example]
attachments: [welcome.svg]
---

Body text…

![welcome.svg](../attachments/welcome.svg)
```

Attachments live in the sibling `attachments/` folder and are referenced by
relative path, so a project folder is fully self-contained and portable.
