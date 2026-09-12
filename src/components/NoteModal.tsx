"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useScrollLock } from "@/lib/useScrollLock";
import { PLACEMENT_LABEL } from "@/lib/placement-tag";
import type { Note } from "@/lib/notes";

function attachmentUrl(project: string, file: string) {
  return `/api/attachments/${encodeURIComponent(project)}/${encodeURIComponent(
    file
  )}`;
}

// Note bodies store image references as markdown; images render separately, so
// strip those lines from the text view to avoid duplication.
function stripImageMarkdown(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^!\[.*\]\(.*\)\s*$/.test(line.trim()))
    .join("\n")
    .trim();
}

/**
 * Focused overlay for reading a single note — title, date, tags, full body, and
 * any images. Same interaction model as the calendar day-detail popover and the
 * photo lightbox: dark backdrop, centered card, closes on backdrop click, ×, or
 * Esc, and locks background scroll via the shared useScrollLock hook.
 *
 * Self-fetches by id, so it works both from a card click and from the Research
 * "Open note →" deep-link (/notes?id=<id>).
 */
export function NoteModal({
  project,
  id,
  researchTitles = {},
  onClose,
  onEdit,
  onDelete,
  onImage,
}: {
  project: string;
  id: string;
  researchTitles?: Record<string, string>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onImage: (src: string) => void;
}) {
  const [note, setNote] = useState<Note | null>(null);
  const [loaded, setLoaded] = useState(false);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(
      `/api/notes?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled) return;
        setNote(res && !res.error ? res : null);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [project, id]);

  const bodyText = note ? stripImageMarkdown(note.body) : "";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal note-modal"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{note?.title ?? "Note"}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!loaded ? (
          <div className="muted" style={{ fontSize: 14 }}>
            Loading…
          </div>
        ) : !note ? (
          <div className="muted" style={{ fontSize: 14 }}>
            This note could not be found.
          </div>
        ) : (
          <>
            <div className="label">{note.date}</div>
            {(note.tags?.length > 0 ||
              note.placement ||
              (note.research ?? []).some((r) => researchTitles[r])) && (
              <div style={{ marginTop: 8 }}>
                {note.placement && (
                  <span className="chip chip-placement">
                    {PLACEMENT_LABEL[note.placement]}
                  </span>
                )}
                {note.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
                {(note.research ?? [])
                  .filter((r) => researchTitles[r])
                  .map((r) => (
                    <Link
                      key={r}
                      href="/research"
                      className="chip chip-research"
                      title={`Research: ${researchTitles[r]}`}
                    >
                      ◈ {researchTitles[r]}
                    </Link>
                  ))}
              </div>
            )}

            {bodyText && (
              <p
                style={{
                  whiteSpace: "pre-wrap",
                  marginTop: 14,
                  lineHeight: 1.6,
                  overflowWrap: "anywhere",
                }}
              >
                {bodyText}
              </p>
            )}

            {(note.attachments ?? []).map((a) => {
              const url = attachmentUrl(project, a);
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

            <div
              className="row"
              style={{ justifyContent: "flex-end", gap: 6, marginTop: 18 }}
            >
              <button className="btn btn-ghost" onClick={onEdit}>
                Edit
              </button>
              <button className="btn btn-ghost danger" onClick={onDelete}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
