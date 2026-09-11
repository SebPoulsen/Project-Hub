"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Meeting } from "@/lib/meetings";

type SaveState = "idle" | "dirty" | "saving" | "saved";
const DEBOUNCE_MS = 1500;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  title: string;
  meeting: string;
  date: string;
  tags: string;
  body: string;
}

const EMPTY: FormState = {
  title: "",
  meeting: "",
  date: todayStr(),
  tags: "",
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
          body: m.body ?? "",
        });
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
      const payload = payloadOf(f);
      if (idRef.current) {
        await fetch(
          `/api/meetings?project=${encodeURIComponent(project)}&id=${encodeURIComponent(idRef.current)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
          }
        );
      } else {
        const res = await fetch(
          `/api/meetings?project=${encodeURIComponent(project)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
          }
        ).then((r) => r.json());
        if (res?.id) {
          idRef.current = res.id;
          onCreated(res.id);
        }
      }
      setState("saved");
      onSaved();
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
