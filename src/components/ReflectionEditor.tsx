"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReflectionData } from "@/lib/reflections";

const EMPTY: ReflectionData = {
  noticed: "",
  learned: "",
  clearer: "",
  notes: "",
  tags: [],
};

const PROMPTS: { key: keyof ReflectionData; label: string; ph: string }[] = [
  {
    key: "noticed",
    label: "What did you notice today?",
    ph: "Observations, moments, surprises…",
  },
  {
    key: "learned",
    label: "What did you learn today?",
    ph: "New knowledge, skills, feedback…",
  },
  {
    key: "clearer",
    label: "What became clearer today?",
    ph: "A hypothesis sharpening, a decision forming…",
  },
];

type SaveState = "idle" | "dirty" | "saving" | "saved";

const DEBOUNCE_MS = 1500;

export function ReflectionEditor({
  project,
  date,
}: {
  project: string;
  date: string;
}) {
  const [data, setData] = useState<ReflectionData>(EMPTY);
  const [state, setState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<ReflectionData>(EMPTY);
  latest.current = data;

  // Load reflection for this project+date.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/reflections?project=${encodeURIComponent(
        project
      )}&date=${encodeURIComponent(date)}`
    )
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setData(res?.data ?? EMPTY);
        setState("idle");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [project, date]);

  const save = useCallback(async () => {
    setState("saving");
    await fetch(
      `/api/reflections?project=${encodeURIComponent(project)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...latest.current }),
      }
    );
    setState("saved");
  }, [project, date]);

  // Debounced autosave: fires 1.5s after the last change — never per keystroke.
  const scheduleSave = useCallback(() => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save();
    }, DEBOUNCE_MS);
  }, [save]);

  // Flush pending save on unmount / navigation.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const update = (key: keyof ReflectionData, value: string) => {
    setData((d) => ({ ...d, [key]: value }));
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

  if (loading) {
    return <div className="muted">Loading…</div>;
  }

  return (
    <div className="stack">
      {PROMPTS.map((p) => (
        <div key={p.key}>
          <label className="prompt-label">{p.label}</label>
          <textarea
            value={data[p.key] as string}
            placeholder={p.ph}
            onChange={(e) => update(p.key, e.target.value)}
            onBlur={flushOnBlur}
          />
        </div>
      ))}
      <div>
        <label className="prompt-label">Freeform notes</label>
        <textarea
          value={data.notes}
          placeholder="Anything else on your mind…"
          onChange={(e) => update("notes", e.target.value)}
          onBlur={flushOnBlur}
        />
      </div>
      <div className="row between">
        <span className={`save-state ${state === "saving" ? "saving" : ""}`}>
          {label}
        </span>
        <button className="btn" onClick={save}>
          Save now
        </button>
      </div>
    </div>
  );
}
