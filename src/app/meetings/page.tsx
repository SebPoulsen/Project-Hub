"use client";

import { useCallback, useEffect, useState } from "react";
import { useHub } from "../providers";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { MeetingModal } from "@/components/MeetingModal";
import { MeetingEditor } from "@/components/MeetingEditor";
import { copyPlainText } from "@/lib/clipboard";
import type { Meeting, MeetingMeta } from "@/lib/meetings";

type FormMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

export default function MeetingsPage() {
  const { current, loading } = useHub();
  const { scheduleDelete } = usePendingDeletes();

  const [meetings, setMeetings] = useState<MeetingMeta[]>([]);
  const [mode, setMode] = useState<FormMode>({ kind: "closed" });
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(""); // meeting-name filter
  const [copiedAll, setCopiedAll] = useState(false);

  const load = useCallback(async () => {
    if (!current) return;
    const list = await fetch(
      `/api/meetings?project=${encodeURIComponent(current.slug)}`
    ).then((r) => r.json());
    setMeetings(list);
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return (
      <div className="empty-state">
        <h2>No project selected</h2>
        <p>Create or pick a project first.</p>
      </div>
    );

  const slug = current.slug;
  const meetingNames = Array.from(
    new Set(meetings.map((m) => m.meeting).filter(Boolean))
  ).sort();
  const visible = filter ? meetings.filter((m) => m.meeting === filter) : meetings;

  function openCreate() {
    setMode({ kind: "create" });
  }

  function openEdit(id: string) {
    setMode({ kind: "edit", id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setMode({ kind: "closed" });
  }

  function remove(m: MeetingMeta) {
    setMeetings((list) => list.filter((x) => x.id !== m.id));
    setMode((cur) => (cur.kind === "edit" && cur.id === m.id ? { kind: "closed" } : cur));
    setViewingId((v) => (v === m.id ? null : v));
    scheduleDelete({
      label: `Meeting "${m.title || m.meeting || "Untitled"}" deleted`,
      perform: async () => {
        await fetch(
          `/api/meetings?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(m.id)}`,
          { method: "DELETE", keepalive: true }
        );
      },
      onUndo: () => load(),
    });
  }

  async function copyAll() {
    const res = await fetch(
      `/api/meetings?project=${encodeURIComponent(slug)}&all=1`
    ).then((r) => r.json());
    const all: Meeting[] = res?.meetings ?? [];
    if (all.length === 0) return;
    const text = all
      .map((m) =>
        [
          `Meeting — ${m.title || "Untitled"} (${m.date})`,
          m.meeting ? `Meeting: ${m.meeting}` : "",
          m.tags?.length ? `Tags: ${m.tags.join(", ")}` : "",
          "",
          m.body || "—",
        ]
          .filter((l, i) => !((i === 1 || i === 2) && l === ""))
          .join("\n")
      )
      .join("\n\n────────────────────────\n\n");
    if (await copyPlainText(text)) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="row between">
          <div>
            <div className="label">{current.name}</div>
            <h1>Meetings</h1>
          </div>
          {mode.kind === "closed" && (
            <div className="row" style={{ gap: 6 }}>
              {meetings.length > 0 && (
                <button className="btn btn-ghost" onClick={copyAll}>
                  {copiedAll ? "Copied ✓" : "Copy all"}
                </button>
              )}
              <button className="btn btn-accent" onClick={openCreate}>
                + New meeting
              </button>
            </div>
          )}
        </div>
      </div>

      {mode.kind !== "closed" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            {mode.kind === "edit" ? "Edit meeting" : "New meeting"}
          </div>
          <MeetingEditor
            key={mode.kind === "edit" ? mode.id : "new"}
            project={slug}
            initialId={mode.kind === "edit" ? mode.id : null}
            meetingNames={meetingNames}
            onSaved={load}
            onCreated={() => {
              /* editor tracks its own id; list refresh comes via onSaved */
            }}
            onClose={closeForm}
          />
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="empty-state">
          <h2>No meetings logged yet</h2>
          <p>Log a meeting you’ve had — paste the notes or transcript, tag it by meeting, and date it.</p>
        </div>
      ) : (
        <>
          {meetingNames.length > 0 && (
            <div className="row" style={{ gap: 8, marginBottom: 16 }}>
              <span className="label">Filter</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ width: "auto" }}
              >
                <option value="">All meetings ({meetings.length})</option>
                {meetingNames.map((n) => (
                  <option key={n} value={n}>
                    {n} ({meetings.filter((m) => m.meeting === n).length})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-2">
            {visible.map((m) => (
              <MeetingCard
                key={m.id}
                meta={m}
                onOpen={() => setViewingId(m.id)}
                onEdit={() => openEdit(m.id)}
                onDelete={() => remove(m)}
              />
            ))}
          </div>
        </>
      )}

      {viewingId && (
        <MeetingModal
          project={slug}
          id={viewingId}
          onClose={() => setViewingId(null)}
          onEdit={() => {
            const id = viewingId;
            setViewingId(null);
            openEdit(id);
          }}
          onDelete={() => {
            const m = meetings.find((x) => x.id === viewingId);
            if (m) remove(m);
          }}
        />
      )}
    </div>
  );
}

function MeetingCard({
  meta,
  onOpen,
  onEdit,
  onDelete,
}: {
  meta: MeetingMeta;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        <h3 style={{ margin: 0, fontSize: 18 }}>{meta.title || "Untitled meeting"}</h3>
        <span className="label">{meta.date}</span>
      </div>
      {(meta.meeting || meta.tags?.length > 0) && (
        <div style={{ marginTop: 8 }}>
          {meta.meeting && (
            <span className="chip chip-research" title={meta.meeting}>
              ▤ {meta.meeting}
            </span>
          )}
          {meta.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}
      {meta.preview && <p className="note-preview">{meta.preview}</p>}
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
