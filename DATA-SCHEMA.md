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
  meetings/
    2026-09-10-weekly-sync.md    ← meeting notes (Phase 2)
  attachments/
    2026-09-10-welcome-photo.jpg
  research.json            ← { items: [] } research questions (Phase 2)
  companies.json           ← { items: [] } companies/visits (Phase 2)
  events.json              ← { items: [] } calendar events (Phase 2)
  evaluations/
    individual.json        ← goal + 14 items + named evaluation sets (Phase 2)
    project-level.json     ← single-pass project evaluation (Phase 2)
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
  "placement": {
    "primary":   { "organisation": "", "location": "", "supervisor": "",
                   "contactEmail": "", "focus": "", "startDate": null, "endDate": null },
    "secondary": { "organisation": "", "location": "", "supervisor": "",
                   "contactEmail": "", "focus": "", "startDate": null, "endDate": null }
  },
  "createdAt": "2026-09-10T…"
}
```

`placement` is structured project-level metadata (Phase 2). Pre–Phase 2 projects
stored `primary`/`secondary` as bare strings; those are migrated on read into the
object above (the old string becomes `organisation`). `researchQuestions` is a
legacy field — questions now live in `research.json`.

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

### `meetings/<id>.md`

Meeting notes — structured logging of meetings that already happened (paste a
transcript or notes). Same file pattern as notes, but a distinct type: no
attachments, plus a `meeting` field naming the meeting/series it belongs to (the
UI tags and filters by it).

```markdown
---
title: Kickoff with mentor
meeting: Weekly sync
date: 2026-09-10
project: my-first-project
tags: [planning]
---

Pasted transcript / notes…
```

### `evaluations/individual.json`

The individual evaluation track. Setup is a `goal` plus 14 rateable `items`
(4 Skill, 4 Knowledge, 4 Attitude, 2 Wild card) with **fixed, deterministic
ids** and user-defined labels — so a set's ratings always key correctly and
relabelling never orphans past ratings. Each `set` is a freely-named evaluation
(e.g. Pre, Midway, Post, Supervisor) rating the 14 items 1–10.

```json
{
  "goal": "Become an effective placement researcher",
  "items": [ { "id": "sk1", "category": "skill", "label": "Public speaking" }, … 14 ],
  "sets": [
    { "id": "ev-…", "name": "Pre", "ratings": { "sk1": 3, "kn1": 4, … },
      "reflections": { "gap": "", "steps": "", "edge": "" }, "createdAt": "…" },
    { "id": "ev-…", "name": "Post", "ratings": { "sk1": 7, "kn1": 6, … },
      "reflections": { "gap": "", "steps": "", "edge": "" }, "createdAt": "…" }
  ]
}
```

Each set also carries three **optional** reflection fields (`gap`, `steps`,
`edge`) — the worksheet prompts, filled per set or left blank. The chart draws
one dashed line per set across the 14 items (grouped by category); there is no
category-average view.

### `evaluations/project-level.json`

Mirrors the individual track: freely-named evaluation `sets`, each capturing the
five fixed rows (a 1–10 `rating` + free `text` per row). No per-project setup —
the rows are fixed. Lets you compare your own Pre/Post against an external
rater's (e.g. a supervisor's) on one chart.

```json
{
  "sets": [
    { "id": "pe-…", "name": "Post", "rows": {
        "scope":             { "rating": 8, "text": "…" },
        "researchQuestions": { "rating": 7, "text": "" },
        "collaboration":     { "rating": 8, "text": "" },
        "insights":          { "rating": 7, "text": "" },
        "changes":           { "rating": 6, "text": "" }
      }, "createdAt": "…" }
  ]
}
```

The earlier single-pass shape (a bare `{ scope: {…}, … }` object) is migrated on
read into a first set named `Initial`, preserving its values.

### `research.json`

Research questions are their own flat collection (parallel to `todos.json`), so
editing a question never rewrites `project.json`. The `researchQuestions` field
on `project.json` is legacy; pre–Phase 2 projects are migrated into this file on
first read.

```json
{
  "items": [
    { "id": "rq-a1b2c3d4", "question": "How do makerspaces sustain funding?",
      "detail": "", "status": "open", "placement": null,
      "groups": [
        { "id": "rg-…", "title": "Grant dependence", "createdAt": "…",
          "subQuestions": [
            { "id": "rs-…", "question": "Which grants recur year to year?", "createdAt": "…" }
          ] }
      ],
      "createdAt": "…" }
  ]
}
```

**Sub-question groups (a nested layer, not a separate collection).** Each
overarching question carries `groups`: titled clusters, each owning a list of
`subQuestions`. Ids use distinct prefixes — `rq-` overarching, `rg-` group,
`rs-` sub-question. A **sub-question is independently taggable** by the same
`research:` mechanism as an overarching question: its `rs-…` id can appear in a
note's/reflection's `research:` list, and its findings are computed live by the
same scan (see *Research findings*). A **group** (`rg-…`) is an organizational
container only — never tagged, holds no findings of its own. Questions saved
before this field get `groups: []` on read (back-compatible). Deleting a
question, a group, or a sub-question scrubs the now-orphaned ids from tagged
entries at delete *finalize* (after the undo window) — for a group, every
sub-question id it contained.

### `companies.json`

The visits tracker — a flat collection. `status` is `"planned"` (an idea to
visit) or `"visited"`. `lat`/`lng` are optional; a company without them just has
no map pin yet. The Phase-1 placeholder shape (a bare `[]`) is read and migrated
to `{ items }` on the next write.

```json
{
  "items": [
    { "id": "co-a1b2c3d4", "name": "FabLab Oslo", "status": "visited",
      "address": "Oslo, Norway", "website": "", "notes": "",
      "lat": 59.9139, "lng": 10.7522, "visitDate": "2026-09-15", "createdAt": "…" }
  ]
}
```

Coordinates are set by geocoding the address (OpenStreetMap Nominatim, on an
explicit "Find on map" click) or by clicking/dragging the pin on the map. The
map view uses Leaflet + OpenStreetMap tiles.

### `events.json`

Calendar events — a genuine scheduled thing (a meeting, a visit, a talk),
distinct from to-dos (tasks) and reflections (journal). A flat collection
(parallel to `todos.json` / `companies.json`), created and edited entirely
through the Calendar: the day-detail popover's Events section and a calendar-
level "Add event" button. `startTime`/`endTime` are optional ("HH:MM", 24h);
an event with no start time is treated as all-day.

```json
{
  "items": [
    { "id": "evt-a1b2c3d4", "title": "Startvækst Aarhus kickoff",
      "date": "2026-09-20", "startTime": "14:00", "endTime": "16:00",
      "notes": "", "companyId": "co-a1b2c3d4", "placement": "primary",
      "createdAt": "…" }
  ]
}
```

`companyId` optionally cross-references a company in `companies.json`. The
company *name* is never stored on the event — it's resolved live from the id
(same "derive from source, never hand-store" rule as research findings). The
reference shows both ways: a 🏢 chip on the event (linking to the company's
card) and a 📅 back-link on the company's card (linking to the event's day).
Companies themselves stay date-free — the date lives on the event. When a
company is deleted, its id is scrubbed from any event that referenced it (the
same timing/intent as scrubbing research refs from notes/reflections).

### Placement tags

To-dos, notes, reflections, companies, meeting notes, research questions, and
calendar events each carry an optional `placement` field — `"primary"`, `"secondary"`, or
`"both"` — associating the entry with the user's placement *within* the project
(a within-project distinction, not separate projects; unrelated to the placement
metadata on `project.json`). Absent/unset is the default; nothing is
retroactively assigned. It's a JSON property on todo/company/research/event
records and a `placement:` frontmatter line on notes/reflections/meetings
(written only when set). Each list view filters by All / Primary / Secondary /
Both (Primary and Secondary also match `both`); on the Calendar the filter is
scoped to events (it doesn't affect the reflection/to-do dots).

### Research findings

**Findings are not stored here.** A question's nested findings are computed live
by scanning which reflections and notes tagged themselves to its id via a
`research: […]` frontmatter list — the same "derive from source, never
hand-assign" rule as the to-do buckets. The id may be an overarching question
(`rq-…`) or a sub-question (`rs-…`); the scan buckets by whatever id it finds,
so sub-questions need no special handling. So both `reflections/*.md` and
`notes/*.md` carry an extra frontmatter line:

```yaml
research: [rq-a1b2c3d4]
```

**Most-specific-per-tree.** Tagging is *narrowing*, not stacking: for any one
overarching question, an entry holds at most one id from that question's tree —
either the `rq-…` id (tagged to the whole question) or one of its `rs-…`
sub-question ids (narrowed). Narrowing to a sub-question in the picker replaces
the overarching id rather than adding to it, so a finding is filed exactly once
and never both under the sub-question and the overarching question's own direct
count. An entry can still tag several *different* questions — the rule is one id
per tree. Tagging the overarching question alone stays fully supported and is
the default.
