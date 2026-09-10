"use client";

import { useEffect, useRef, useState } from "react";
import { useHub } from "../providers";
import { Lightbox } from "@/components/Lightbox";
import { usePendingDeletes } from "@/components/PendingDeletes";
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

export default function NotesPage() {
  const { current, loading } = useHub();
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [mode, setMode] = useState<FormMode>({ kind: "closed" });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [keep, setKeep] = useState<string[]>([]); // existing attachments to retain (edit)
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { scheduleDelete } = usePendingDeletes();

  async function load() {
    if (!current) return;
    const list = await fetch(
      `/api/notes?project=${encodeURIComponent(current.slug)}`
    ).then((r) => r.json());
    setNotes(list);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function resetForm() {
    setTitle("");
    setBody("");
    setTags("");
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
    // If this note is open in the editor, close the editor.
    setMode((m) => (m.kind === "edit" && m.id === id ? { kind: "closed" } : m));
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
            <button className="btn btn-accent" onClick={openCreate}>
              + New note
            </button>
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
            onImage={setLightbox}
            onEdit={() => openEdit(n.id)}
            onDelete={() => remove(n.id)}
          />
        ))}
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function NoteCard({
  project,
  meta,
  onImage,
  onEdit,
  onDelete,
}: {
  project: string;
  meta: NoteMeta;
  onImage: (src: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [note, setNote] = useState<Note | null>(null);
  const [open, setOpen] = useState(false);

  async function toggle() {
    if (!open && !note) {
      const full = await fetch(
        `/api/notes?project=${encodeURIComponent(project)}&id=${encodeURIComponent(meta.id)}`
      ).then((r) => r.json());
      setNote(full);
    }
    setOpen((o) => !o);
  }

  const attachments = (note ?? meta).attachments ?? [];

  return (
    <div className="card note-card">
      <div className="row between">
        <h3 style={{ margin: 0, fontSize: 18 }}>{meta.title}</h3>
        <span className="label">{meta.date}</span>
      </div>
      {meta.tags?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {meta.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}
      {open && note && (
        <p style={{ whiteSpace: "pre-wrap", marginTop: 12, lineHeight: 1.55 }}>
          {stripImageMarkdown(note.body)}
        </p>
      )}
      {attachments.map((a) => {
        const url = attachmentUrl(project, a);
        return (
          <img key={a} src={url} alt={a} loading="lazy" onClick={() => onImage(url)} />
        );
      })}
      <div className="row between" style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={toggle}>
          {open ? "Hide" : "Read"}
        </button>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost" onClick={onEdit}>
            Edit
          </button>
          <button className="btn btn-ghost danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
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
