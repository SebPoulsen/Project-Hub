"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { PlacementPicker } from "@/components/PlacementPicker";
import { PdfAttachments } from "@/components/PdfAttachments";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { attachmentLabel } from "@/lib/attachments";
import type { PlacementTag } from "@/lib/placement-tag";
import type { Meeting } from "@/lib/meetings";

type SaveState = "idle" | "dirty" | "saving" | "saved";
const DEBOUNCE_MS = 1500;

// Chromium caps the total body of all in-flight `keepalive` fetches at 64KB and
// rejects the request outright (a synchronous TypeError) once it's exceeded.
// A long transcript blows past that, so `keepalive` is only safe for small
// bodies; larger saves fall back to a normal fetch. 60KB leaves headroom under
// the 64KB cap for the JSON envelope and any concurrent keepalive requests.
const KEEPALIVE_MAX_BYTES = 60_000;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  title: string;
  meeting: string;
  date: string;
  tags: string;
  placement: PlacementTag | null;
  body: string;
}

const EMPTY: FormState = {
  title: "",
  meeting: "",
  date: todayStr(),
  tags: "",
  placement: null,
  body: "",
};

/**
 * Meeting editor with debounced autosave (~1.5s idle + on blur), mirroring the
 * reflection editor — because a meeting transcript typed live is costly to lose.
 *
 * A new meeting has no id until its first save, so the first autosave POSTs
 * (create) and captures the returned id; subsequent saves PUT to it. Saves are
 * serialized through an in-flight lock so a blur-flush racing the debounce timer
 * can never create the same meeting twice.
 */
export function MeetingEditor({
  project,
  initialId,
  meetingNames,
  onSaved,
  onCreated,
  onClose,
}: {
  project: string;
  initialId: string | null; // null = new meeting
  meetingNames: string[];
  /** After any successful save — refresh the list. */
  onSaved: () => void;
  /** After the first save of a NEW meeting — the page records its id. */
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [state, setState] = useState<SaveState>(initialId ? "idle" : "idle");
  const [loading, setLoading] = useState(!!initialId);

  // Attached PDFs (managed via a separate multipart endpoint, not the text
  // autosave). Display-only state here; the file on disk is the source of truth.
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { scheduleDelete } = usePendingDeletes();

  const idRef = useRef<string | null>(initialId);
  const latest = useRef<FormState>(EMPTY);
  latest.current = form;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const pending = useRef(false);

  // Load existing meeting (edit mode).
  useEffect(() => {
    if (!initialId) return;
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/meetings?project=${encodeURIComponent(project)}&id=${encodeURIComponent(initialId)}`
    )
      .then((r) => r.json())
      .then((m: Meeting) => {
        if (cancelled) return;
        setForm({
          title: m.title ?? "",
          meeting: m.meeting ?? "",
          date: m.date ?? todayStr(),
          tags: (m.tags ?? []).join(", "),
          placement: m.placement ?? null,
          body: m.body ?? "",
        });
        setAttachments(m.attachments ?? []);
        setState("idle");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [project, initialId]);

  function payloadOf(f: FormState) {
    return {
      title: f.title,
      meeting: f.meeting,
      date: f.date || todayStr(),
      tags: f.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      placement: f.placement,
      body: f.body,
    };
  }

  function isEmpty(f: FormState) {
    return !f.title.trim() && !f.body.trim() && !f.meeting.trim();
  }

  const save = useCallback(async () => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    const f = latest.current;
    if (isEmpty(f)) {
      setState("idle");
      return;
    }
    inFlight.current = true;
    setState("saving");
    try {
      const body = JSON.stringify(payloadOf(f));
      // Only keep `keepalive` for small bodies — a long transcript exceeds the
      // browser's keepalive size cap and the request is rejected silently.
      const keepalive =
        new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES;
      if (idRef.current) {
        await fetch(
          `/api/meetings?project=${encodeURIComponent(project)}&id=${encodeURIComponent(idRef.current)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive,
          }
        );
      } else {
        const res = await fetch(
          `/api/meetings?project=${encodeURIComponent(project)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive,
          }
        ).then((r) => r.json());
        if (res?.id) {
          idRef.current = res.id;
          onCreated(res.id);
        }
      }
      setState("saved");
      onSaved();
    } catch {
      // Surface the failure instead of leaving the label stuck on "Saving…".
      setState("dirty");
    } finally {
      inFlight.current = false;
      if (pending.current) {
        pending.current = false;
        save();
      }
    }
  }, [project, onSaved, onCreated]);

  const scheduleSave = useCallback(() => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, DEBOUNCE_MS);
  }, [save]);

  // Flush pending timer on unmount (navigation-away). The fetch uses keepalive.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (state === "dirty") save();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    scheduleSave();
  };

  const flushOnBlur = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (state === "dirty" || state === "saving") save();
  };

  // A PDF can only attach to a saved meeting (it needs an id). For a new
  // meeting, flush a save first; if it's still empty there's nothing to attach
  // to, so ask for some text.
  const ensureSaved = useCallback(async (): Promise<string | null> => {
    if (idRef.current) return idRef.current;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await save();
    return idRef.current;
  }, [save]);

  const onPickPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file later
    if (picked.length === 0) return;
    setAttachErr(null);
    const pdfs = picked.filter((f) => /\.pdf$/i.test(f.name));
    const nonPdf = picked.length - pdfs.length;
    if (pdfs.length === 0) {
      setAttachErr("Only PDF files are supported.");
      return;
    }
    setAttachBusy(true);
    try {
      const mid = await ensureSaved();
      if (!mid) {
        setAttachErr("Add a title or note first, then attach a PDF.");
        return;
      }
      // Upload sequentially — each request appends to the file's list on the
      // server (read-modify-write under the per-project lock), so serial keeps
      // the returned list cumulative and correct.
      let failed = 0;
      for (const file of pdfs) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(
          `/api/meetings/attachments?project=${encodeURIComponent(project)}&id=${encodeURIComponent(mid)}`,
          { method: "POST", body: fd }
        );
        if (res.ok) {
          const updated: Meeting = await res.json();
          setAttachments(updated.attachments ?? []);
        } else {
          failed++;
        }
      }
      onSaved();
      const problems: string[] = [];
      if (nonPdf) problems.push(`${nonPdf} non-PDF file${nonPdf > 1 ? "s" : ""} skipped`);
      if (failed) problems.push(`${failed} upload${failed > 1 ? "s" : ""} failed`);
      if (problems.length) setAttachErr(`${problems.join("; ")}.`);
    } finally {
      setAttachBusy(false);
    }
  };

  // Soft-delete + undo, like the rest of the app: hide immediately, and only
  // fire the real remove (file + frontmatter + commit) after the undo window.
  const removePdf = (file: string) => {
    const mid = idRef.current;
    if (!mid) return;
    setAttachments((a) => a.filter((x) => x !== file));
    scheduleDelete({
      label: `PDF "${attachmentLabel(file)}" removed`,
      perform: async () => {
        await fetch(
          `/api/meetings/attachments?project=${encodeURIComponent(project)}&id=${encodeURIComponent(mid)}&file=${encodeURIComponent(file)}`,
          { method: "DELETE" }
        );
        onSaved();
      },
      onUndo: () =>
        setAttachments((a) => (a.includes(file) ? a : [...a, file])),
    });
  };

  const label =
    state === "saving"
      ? "Saving…"
      : state === "dirty"
      ? "Unsaved changes"
      : state === "saved"
      ? "Saved ✓"
      : "";

  if (loading) return <div className="muted">Loading…</div>;

  return (
    <div className="stack">
      <input
        type="text"
        placeholder="Title / subject"
        value={form.title}
        onChange={(e) => update("title", e.target.value)}
        onBlur={flushOnBlur}
      />
      <div className="row" style={{ gap: 10 }}>
        <input
          type="text"
          placeholder="Meeting name (e.g. Weekly sync, Client X)"
          value={form.meeting}
          onChange={(e) => update("meeting", e.target.value)}
          onBlur={flushOnBlur}
          list="meeting-names"
        />
        <datalist id="meeting-names">
          {meetingNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <input
          type="date"
          value={form.date}
          onChange={(e) => update("date", e.target.value)}
          onBlur={flushOnBlur}
          style={{ width: "auto" }}
        />
      </div>
      <textarea
        placeholder="Paste the transcript or meeting notes…"
        value={form.body}
        onChange={(e) => update("body", e.target.value)}
        onBlur={flushOnBlur}
        style={{ minHeight: 220 }}
      />
      <input
        type="text"
        placeholder="Tags (comma separated)"
        value={form.tags}
        onChange={(e) => update("tags", e.target.value)}
        onBlur={flushOnBlur}
      />
      <PlacementPicker
        value={form.placement}
        onChange={(p) => {
          setForm((f) => ({ ...f, placement: p }));
          scheduleSave();
        }}
      />

      {/* PDF attachments — a real document that travels with the meeting. */}
      <div className="stack" style={{ gap: 6 }}>
        <PdfAttachments
          project={project}
          files={attachments}
          entryId={idRef.current ?? undefined}
          onRemove={removePdf}
        />
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            {attachBusy ? "Attaching…" : "📎 Attach PDF"}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              disabled={attachBusy}
              onChange={onPickPdf}
              style={{ display: "none" }}
            />
          </label>
          {attachErr && (
            <span className="muted" style={{ fontSize: 13, color: "var(--danger)" }}>
              {attachErr}
            </span>
          )}
        </div>
      </div>

      <div className="row between">
        <span className={`save-state ${state === "saving" ? "saving" : ""}`}>
          {label}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={save}>
            Save now
          </button>
          <button className="btn btn-accent" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
