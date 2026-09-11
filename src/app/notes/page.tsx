"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useHub } from "../providers";
import { Lightbox } from "@/components/Lightbox";
import { NoteModal } from "@/components/NoteModal";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { ResearchPicker } from "@/components/ResearchPicker";
import { copyPlainText } from "@/lib/clipboard";
import type { Note, NoteMeta } from "@/lib/notes";

type FormMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

function attachmentUrl(project: string, file: string) {
  return `/api/attachments/${encodeURIComponent(project)}/${encodeURIComponent(
    file
  )}`;
}

function NotesInner() {
  const { current, loading } = useHub();
  const params = useSearchParams();
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  // rq-id -> question title, for showing research tags on cards + the modal.
  const [researchTitles, setResearchTitles] = useState<Record<string, string>>(
    {}
  );
  const [copiedAll, setCopiedAll] = useState(false);
  // Note currently open in the reading modal (also the target of the Research
  // "Open note →" deep-link: /notes?id=<id>).
  const [viewingId, setViewingId] = useState<string | null>(null);
  const openId = params.get("id");
  const [mode, setMode] = useState<FormMode>({ kind: "closed" });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [research, setResearch] = useState<string[]>([]); // tagged research-question ids
  const [keep, setKeep] = useState<string[]>([]); // existing attachments to retain (edit)
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { scheduleDelete } = usePendingDeletes();

  async function load() {
    if (!current) return;
    const [list, research] = await Promise.all([
      fetch(`/api/notes?project=${encodeURIComponent(current.slug)}`).then((r) =>
        r.json()
      ),
      fetch(`/api/research?project=${encodeURIComponent(current.slug)}`).then(
        (r) => r.json()
      ),
    ]);
    setNotes(list);
    const map: Record<string, string> = {};
    for (const q of research?.items ?? []) map[q.id] = q.question;
    setResearchTitles(map);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Deep-link: open the reading modal directly to the note in ?id=. Runs only
  // when the param changes, so closing the modal doesn't immediately reopen it.
  useEffect(() => {
    if (openId) setViewingId(openId);
  }, [openId]);

  function resetForm() {
    setTitle("");
    setBody("");
    setTags("");
    setResearch([]);
    setKeep([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function openCreate() {
    resetForm();
    setMode({ kind: "create" });
  }

  async function openEdit(id: string) {
    if (!current) return;
    const full: Note = await fetch(
      `/api/notes?project=${encodeURIComponent(current.slug)}&id=${encodeURIComponent(id)}`
    ).then((r) => r.json());
    setTitle(full.title);
    setBody(stripImageMarkdown(full.body));
    setTags((full.tags ?? []).join(", "));
    setResearch(full.research ?? []);
    setKeep(full.attachments ?? []);
    if (fileRef.current) fileRef.current.value = "";
    setMode({ kind: "edit", id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setMode({ kind: "closed" });
    resetForm();
  }

  async function submit() {
    if (!current || mode.kind === "closed") return;
    const hasNewFiles = !!fileRef.current?.files?.length;
    if (!title.trim() && !body.trim() && !hasNewFiles && keep.length === 0) return;

    setBusy(true);
    const fd = new FormData();
    fd.append("title", title);
    fd.append("body", body);
    fd.append("tags", tags);
    fd.append("research", research.join(","));
    const files = fileRef.current?.files;
    if (files) for (const f of Array.from(files)) fd.append("files", f);

    if (mode.kind === "create") {
      await fetch(`/api/notes?project=${encodeURIComponent(current.slug)}`, {
        method: "POST",
        body: fd,
      });
    } else {
      fd.append("keep", keep.join(","));
      await fetch(
        `/api/notes?project=${encodeURIComponent(current.slug)}&id=${encodeURIComponent(mode.id)}`,
        { method: "PUT", body: fd }
      );
    }

    setBusy(false);
    closeForm();
    load();
  }

  function remove(id: string) {
    if (!current) return;
    const slug = current.slug;
    const note = notes.find((n) => n.id === id);
    // Hide immediately; the real DELETE (with orphan-attachment cleanup) only
    // runs after the undo window closes.
    setNotes((n) => n.filter((x) => x.id !== id));
    // If this note is open in the editor or reading modal, close it.
    setMode((m) => (m.kind === "edit" && m.id === id ? { kind: "closed" } : m));
    setViewingId((v) => (v === id ? null : v));
    scheduleDelete({
      label: `Note "${note?.title ?? "Untitled"}" deleted`,
      perform: async () => {
        await fetch(
          `/api/notes?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
      },
      onUndo: () => load(), // file still exists during the window, so it reappears
    });
  }

  // Copy every note as plain text, oldest-to-newest, for pasting into a report
  // or handing to Claude. Mirrors the Reflections "Copy all".
  async function copyAll() {
    if (!current) return;
    const res = await fetch(
      `/api/notes?project=${encodeURIComponent(current.slug)}&all=1`
    ).then((r) => r.json());
    const all: Note[] = res?.notes ?? [];
    if (all.length === 0) return;
    const text = all
      .map((n) =>
        [
          `Note — ${n.title || "Untitled"} (${n.date})`,
          n.tags?.length ? `Tags: ${n.tags.join(", ")}` : "",
          "",
          stripImageMarkdown(n.body) || "—",
        ]
          .filter((l, i) => !(i === 1 && l === ""))
          .join("\n")
      )
      .join("\n\n────────────────────────\n\n");
    if (await copyPlainText(text)) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  }

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return (
      <div className="empty-state">
        <h2>No project selected</h2>
        <p>Create or pick a project first.</p>
      </div>
    );

  return (
    <div>
      <div className="page-head">
        <div className="row between">
          <div>
            <div className="label">{current.name}</div>
            <h1>Notes</h1>
          </div>
          {mode.kind === "closed" && (
            <div className="row" style={{ gap: 6 }}>
              {notes.length > 0 && (
                <button className="btn btn-ghost" onClick={copyAll}>
                  {copiedAll ? "Copied ✓" : "Copy all"}
                </button>
              )}
              <button className="btn btn-accent" onClick={openCreate}>
                + New note
              </button>
            </div>
          )}
        </div>
      </div>

      {mode.kind !== "closed" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            {mode.kind === "edit" ? "Edit note" : "New note"}
          </div>
          <div className="stack">
            <input
              type="text"
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              placeholder="Write your note…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ minHeight: 120 }}
            />
            <input
              type="text"
              placeholder="Tags (comma separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />

            <ResearchPicker
              project={current.slug}
              selected={research}
              onChange={setResearch}
            />

            {/* Existing attachments (edit mode) — click × to drop one */}
            {keep.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>
                  Current images — keeping {keep.length}
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
                  {keep.map((a) => (
                    <div key={a} className="thumb-wrap">
                      <img
                        src={attachmentUrl(current.slug, a)}
                        alt={a}
                        className="thumb"
                        onClick={() => setLightbox(attachmentUrl(current.slug, a))}
                      />
                      <button
                        className="thumb-remove"
                        title="Remove this image from the note"
                        onClick={() =>
                          setKeep((k) => k.filter((x) => x !== a))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="row between">
              <label className="stack" style={{ gap: 4 }}>
                <span className="label">Add images</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ width: "auto", border: "none", padding: 0 }}
                />
              </label>
              <div className="row">
                <button className="btn btn-ghost" onClick={closeForm}>
                  Cancel
                </button>
                <button className="btn btn-accent" onClick={submit} disabled={busy}>
                  {busy
                    ? "Saving…"
                    : mode.kind === "edit"
                    ? "Save changes"
                    : "Save note"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        {notes.length === 0 && <div className="muted">No notes yet.</div>}
        {notes.map((n) => (
          <NoteCard
            key={n.id}
            project={current.slug}
            meta={n}
            researchTitles={researchTitles}
            onOpen={() => setViewingId(n.id)}
            onEdit={() => openEdit(n.id)}
            onDelete={() => remove(n.id)}
          />
        ))}
      </div>

      {viewingId && (
        <NoteModal
          project={current.slug}
          id={viewingId}
          researchTitles={researchTitles}
          onClose={() => setViewingId(null)}
          onEdit={() => {
            const id = viewingId;
            setViewingId(null);
            openEdit(id);
          }}
          onDelete={() => remove(viewingId)}
          onImage={setLightbox}
        />
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function NoteCard({
  project,
  meta,
  researchTitles,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: string;
  meta: NoteMeta;
  researchTitles: Record<string, string>;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cover = (meta.attachments ?? [])[0];
  const linkedQuestions = (meta.research ?? []).filter((id) => researchTitles[id]);

  return (
    <div
      className="card note-card note-card-click"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="row between">
        <h3 style={{ margin: 0, fontSize: 18 }}>{meta.title}</h3>
        <span className="label">{meta.date}</span>
      </div>
      {(meta.tags?.length > 0 || linkedQuestions.length > 0) && (
        <div style={{ marginTop: 8 }}>
          {meta.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          {linkedQuestions.map((id) => (
            <span key={id} className="chip chip-research" title={researchTitles[id]}>
              ◈ {researchTitles[id]}
            </span>
          ))}
        </div>
      )}
      {meta.preview && (
        <p className="note-preview">{meta.preview}</p>
      )}
      {cover && (
        // Cover preview only; opening the note is handled by the card click.
        <img
          src={attachmentUrl(project, cover)}
          alt={cover}
          loading="lazy"
          style={{ pointerEvents: "none" }}
        />
      )}
      {/* Action buttons stop propagation so they don't also open the modal. */}
      <div className="row" style={{ justifyContent: "flex-end", gap: 6, marginTop: 12 }}>
        <button
          className="btn btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          Edit
        </button>
        <button
          className="btn btn-ghost danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function NotesPage() {
  // useSearchParams requires a Suspense boundary.
  return (
    <Suspense fallback={<div className="muted">Loading…</div>}>
      <NotesInner />
    </Suspense>
  );
}

// Note bodies store image references as markdown; we render images separately,
// so strip those lines from the text view / editor to avoid duplication.
function stripImageMarkdown(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^!\[.*\]\(.*\)\s*$/.test(line.trim()))
    .join("\n")
    .trim();
}
