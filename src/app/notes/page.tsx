"use client";

import { Suspense, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useHub } from "../providers";
import { Lightbox } from "@/components/Lightbox";
import { NoteModal } from "@/components/NoteModal";
import { PdfAttachments } from "@/components/PdfAttachments";
import { splitAttachments } from "@/lib/attachments";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { ResearchPicker } from "@/components/ResearchPicker";
import { ResearchChip } from "@/components/ResearchChip";
import { PlacementPicker } from "@/components/PlacementPicker";
import { PlacementFilter } from "@/components/PlacementFilter";
import { copyPlainText } from "@/lib/clipboard";
import { buildResearchLabels, formatTagLine } from "@/lib/tag-summary";
import {
  placementMatches,
  PLACEMENT_LABEL,
  type PlacementTag,
  type PlacementFilterValue,
} from "@/lib/placement-tag";
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
  const [place, setPlace] = useState<PlacementTag | null>(null);
  const [placeFilter, setPlaceFilter] = useState<PlacementFilterValue>("all");
  const [keep, setKeep] = useState<string[]>([]); // existing attachments to retain (edit)
  // Files picked but not yet saved. Accumulated across picks (a native file
  // input replaces its selection each time, so reading it at Save would drop
  // everything but the last pick). `url` is an object URL for image previews.
  const [pending, setPending] = useState<{ file: File; url: string | null }[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { scheduleDelete } = usePendingDeletes();

  // Revoke any pending image object URLs when the page unmounts (normal close
  // flows revoke via clearPending/removePending).
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    };
  }, []);

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
    // Map every taggable research id -> a display label, covering both
    // overarching questions and their nested sub-questions (a note's
    // `research:` ref can point to either). Sub-questions carry their parent
    // for context and a ↳ marker so a narrowed tag reads distinctly.
    const map: Record<string, string> = {};
    for (const q of research?.items ?? []) {
      map[q.id] = q.question;
      for (const g of q.groups ?? []) {
        for (const s of g.subQuestions ?? []) {
          map[s.id] = `${q.question} ↳ ${s.question}`;
        }
      }
    }
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

  function clearPending() {
    setPending((prev) => {
      prev.forEach((p) => p.url && URL.revokeObjectURL(p.url));
      return [];
    });
    setFileErr(null);
  }

  function resetForm() {
    setTitle("");
    setBody("");
    setTags("");
    setResearch([]);
    setPlace(null);
    setKeep([]);
    clearPending();
    if (fileRef.current) fileRef.current.value = "";
  }

  const isImageFile = (f: File) => f.type.startsWith("image/");
  const isPdfFile = (f: File) =>
    f.type === "application/pdf" || /\.pdf$/i.test(f.name);

  // Accumulate picked files instead of relying on the input's live selection
  // (which each pick replaces). Images and PDFs are kept; anything else is
  // skipped with a message.
  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same file be re-picked; drop stale selection
    if (picked.length === 0) return;
    const ok = picked.filter((f) => isImageFile(f) || isPdfFile(f));
    const skipped = picked.length - ok.length;
    setPending((prev) => [
      ...prev,
      ...ok.map((f) => ({ file: f, url: isImageFile(f) ? URL.createObjectURL(f) : null })),
    ]);
    setFileErr(
      skipped
        ? `${skipped} unsupported file${skipped > 1 ? "s" : ""} skipped (images and PDFs only).`
        : null
    );
  }

  function removePending(idx: number) {
    setPending((prev) => {
      const next = prev.slice();
      const [removed] = next.splice(idx, 1);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return next;
    });
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
    setPlace(full.placement ?? null);
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
    if (!title.trim() && !body.trim() && pending.length === 0 && keep.length === 0)
      return;

    setBusy(true);
    const fd = new FormData();
    fd.append("title", title);
    fd.append("body", body);
    fd.append("tags", tags);
    fd.append("research", research.join(","));
    fd.append("placement", place ?? "");
    // Upload the accumulated picks (across every round), not the input's last
    // selection.
    for (const { file } of pending) fd.append("files", file);

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
    const [res, research] = await Promise.all([
      fetch(`/api/notes?project=${encodeURIComponent(current.slug)}&all=1`).then(
        (r) => r.json()
      ),
      fetch(`/api/research?project=${encodeURIComponent(current.slug)}`).then(
        (r) => r.json()
      ),
    ]);
    const all: Note[] = res?.notes ?? [];
    if (all.length === 0) return;
    const labels = buildResearchLabels(research?.items ?? []);
    const text = all
      .map((n) => {
        const tagLine = formatTagLine({
          research: n.research,
          placement: n.placement,
          labels,
        });
        return [
          `Note — ${n.title || "Untitled"} (${n.date})`,
          ...(tagLine ? [tagLine] : []),
          ...(n.tags?.length ? [`Tags: ${n.tags.join(", ")}`] : []),
          "",
          stripImageMarkdown(n.body) || "—",
        ].join("\n");
      })
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

            <PlacementPicker value={place} onChange={setPlace} />

            {/* Existing attachments (edit mode) — click × to drop one. Removal
                takes effect on Save (the note's own delete carries undo). */}
            {keep.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>
                  Current attachments — keeping {keep.length}
                </div>
                {splitAttachments(keep).images.length > 0 && (
                  <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
                    {splitAttachments(keep).images.map((a) => (
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
                )}
                <PdfAttachments
                  project={current.slug}
                  files={splitAttachments(keep).pdfs}
                  entryId={mode.kind === "edit" ? mode.id : undefined}
                  onRemove={(f) => setKeep((k) => k.filter((x) => x !== f))}
                />
              </div>
            )}

            {/* Files picked but not yet saved — accumulated across picks, each
                removable, attached on Save. */}
            {pending.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>
                  To attach on save — {pending.length}
                </div>
                <div
                  className="row"
                  style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}
                >
                  {pending.map((p, i) =>
                    p.url ? (
                      <div key={i} className="thumb-wrap">
                        <img src={p.url} alt={p.file.name} className="thumb" />
                        <button
                          className="thumb-remove"
                          title="Remove this file"
                          onClick={() => removePending(i)}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <span key={i} className="pdf-chip">
                        <span className="pdf-chip-link" style={{ cursor: "default" }}>
                          <span className="pdf-icon" aria-hidden="true">
                            PDF
                          </span>
                          <span className="pdf-name">{p.file.name}</span>
                        </span>
                        <button
                          type="button"
                          className="pdf-remove"
                          title="Remove this file"
                          aria-label={`Remove ${p.file.name}`}
                          onClick={() => removePending(i)}
                        >
                          ×
                        </button>
                      </span>
                    )
                  )}
                </div>
              </div>
            )}

            {fileErr && (
              <div className="muted" style={{ fontSize: 13, color: "var(--danger)" }}>
                {fileErr}
              </div>
            )}

            <div className="row between">
              {/* Styled trigger over a hidden native input — matches the
                  Meetings attach button. Notes accepts images and PDFs. */}
              <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
                📎 Attach file
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  multiple
                  onChange={onPickFiles}
                  style={{ display: "none" }}
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

      {notes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <PlacementFilter value={placeFilter} onChange={setPlaceFilter} />
        </div>
      )}

      <div className="grid grid-2">
        {notes.length === 0 && <div className="muted">No notes yet.</div>}
        {notes
          .filter((n) => placementMatches(n.placement, placeFilter))
          .map((n) => (
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
  const { images, pdfs } = splitAttachments(meta.attachments ?? []);
  const cover = images[0];
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
      {(meta.tags?.length > 0 || linkedQuestions.length > 0 || meta.placement) && (
        <div style={{ marginTop: 8 }}>
          {meta.placement && (
            <span className="chip chip-placement">
              {PLACEMENT_LABEL[meta.placement]}
            </span>
          )}
          {meta.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          {linkedQuestions.map((id) => (
            <ResearchChip key={id} label={researchTitles[id]} />
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
      <PdfAttachments project={project} files={pdfs} entryId={meta.id} />
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
