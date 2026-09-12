"use client";

import { useEffect, useState } from "react";
import { useScrollLock } from "@/lib/useScrollLock";
import { PLACEMENT_LABEL } from "@/lib/placement-tag";
import type { Meeting } from "@/lib/meetings";

/**
 * Focused overlay for reading a single meeting note — same interaction model as
 * the note modal (dark backdrop, centered card, closes on backdrop/×/Esc, locks
 * background scroll). Self-fetches by id.
 */
export function MeetingModal({
  project,
  id,
  onClose,
  onEdit,
  onDelete,
}: {
  project: string;
  id: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
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
      `/api/meetings?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled) return;
        setMeeting(res && !res.error ? res : null);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [project, id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{meeting?.title ?? "Meeting"}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!loaded ? (
          <div className="muted" style={{ fontSize: 14 }}>
            Loading…
          </div>
        ) : !meeting ? (
          <div className="muted" style={{ fontSize: 14 }}>
            This meeting could not be found.
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <span className="label">{meeting.date}</span>
              {meeting.meeting && (
                <span className="chip chip-research">▤ {meeting.meeting}</span>
              )}
              {meeting.placement && (
                <span className="chip chip-placement">
                  {PLACEMENT_LABEL[meeting.placement]}
                </span>
              )}
            </div>
            {meeting.tags?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {meeting.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {meeting.body && (
              <p
                style={{
                  whiteSpace: "pre-wrap",
                  marginTop: 14,
                  lineHeight: 1.6,
                  overflowWrap: "anywhere",
                }}
              >
                {meeting.body}
              </p>
            )}
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
