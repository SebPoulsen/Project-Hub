"use client";

import { useEffect, useRef, useState } from "react";
import { useHub } from "../providers";
import { Lightbox } from "@/components/Lightbox";
import type { Note } from "@/lib/notes";

export default function NotesPage() {
  const { current, loading } = useHub();
  const [notes, setNotes] = useState<Note[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!current) return;
    const list = await fetch(
      `/api/notes?project=${encodeURIComponent(current.slug)}`
    ).then((r) => r.json());
    // list returns metadata; fetch each note's body lazily is overkill — the
    // metadata already carries attachments. Render body only after opening.
    setNotes(list);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  async function submit() {
    if (!current) return;
    if (!title.trim() && !body.trim() && !(fileRef.current?.files?.length)) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("title", title);
    fd.append("body", body);
    fd.append("tags", tags);
    const files = fileRef.current?.files;
    if (files) {
      for (const f of Array.from(files)) fd.append("files", f);
    }
    await fetch(`/api/notes?project=${encodeURIComponent(current.slug)}`, {
      method: "POST",
      body: fd,
    });
    setTitle("");
    setBody("");
    setTags("");
    if (fileRef.current) fileRef.current.value = "";
    setCreating(false);
    setBusy(false);
    load();
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
          {!creating && (
            <button className="btn btn-accent" onClick={() => setCreating(true)}>
              + New note
            </button>
          )}
        </div>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 20 }}>
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
            <div className="row between">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ width: "auto", border: "none", padding: 0 }}
              />
              <div className="row">
                <button
                  className="btn btn-ghost"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-accent"
                  onClick={submit}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save note"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        {notes.length === 0 && (
          <div className="muted">No notes yet.</div>
        )}
        {notes.map((n) => (
          <NoteCard
            key={n.id}
            project={current.slug}
            meta={n}
            onImage={setLightbox}
          />
        ))}
      </div>

      {lightbox && (
        <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

function NoteCard({
  project,
  meta,
  onImage,
}: {
  project: string;
  meta: Note;
  onImage: (src: string) => void;
}) {
  const [note, setNote] = useState<Note | null>(null);
  const [open, setOpen] = useState(false);

  async function toggle() {
    if (!open && !note) {
      const full = await fetch(
        `/api/notes?project=${encodeURIComponent(project)}&id=${encodeURIComponent(
          meta.id
        )}`
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
        const url = `/api/attachments/${encodeURIComponent(
          project
        )}/${encodeURIComponent(a)}`;
        return (
          <img
            key={a}
            src={url}
            alt={a}
            loading="lazy"
            onClick={() => onImage(url)}
          />
        );
      })}
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={toggle}>
          {open ? "Hide" : "Read"}
        </button>
      </div>
    </div>
  );
}

// The body stores image references as markdown; we render images separately,
// so strip those lines from the text view to avoid duplication.
function stripImageMarkdown(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^!\[.*\]\(.*\)\s*$/.test(line.trim()))
    .join("\n")
    .trim();
}
