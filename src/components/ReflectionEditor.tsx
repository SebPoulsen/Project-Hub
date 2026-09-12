"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReflectionData } from "@/lib/reflections";
import { ResearchPicker } from "@/components/ResearchPicker";
import { PlacementPicker } from "@/components/PlacementPicker";
import type { PlacementTag } from "@/lib/placement-tag";

const EMPTY: ReflectionData = {
  noticed: "",
  learned: "",
  clearer: "",
  notes: "",
  tags: [],
  research: [],
  placement: null,
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
  onSaved,
  onDelete,
}: {
  project: string;
  date: string;
  /** Called after a successful save (e.g. so the parent can refresh its list). */
  onSaved?: () => void;
  /** Called when the user deletes this entry (parent handles soft-delete). */
  onDelete?: () => void;
}) {
  const [data, setData] = useState<ReflectionData>(EMPTY);
  const [state, setState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
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
    onSaved?.();
  }, [project, date, onSaved]);

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

  // Copy the full reflection (all prompts + notes) as plain text.
  const copyToClipboard = async () => {
    const d = latest.current;
    const text = [
      `Reflection — ${date}`,
      "",
      "What did you notice today?",
      d.noticed.trim() || "—",
      "",
      "What did you learn today?",
      d.learned.trim() || "—",
      "",
      "What became clearer today?",
      d.clearer.trim() || "—",
      "",
      "Notes",
      d.notes.trim() || "—",
    ].join("\n");

    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    };
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      // Clipboard API can be blocked on http/localhost in some browsers.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
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
      <ResearchPicker
        project={project}
        selected={data.research}
        onChange={(ids) => {
          setData((d) => ({ ...d, research: ids }));
          scheduleSave();
        }}
      />
      <PlacementPicker
        value={data.placement}
        onChange={(p: PlacementTag | null) => {
          setData((d) => ({ ...d, placement: p }));
          scheduleSave();
        }}
      />
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          {onDelete && (
            <button className="btn btn-ghost danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <span className={`save-state ${state === "saving" ? "saving" : ""}`}>
            {label}
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={copyToClipboard}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button className="btn" onClick={save}>
            Save now
          </button>
        </div>
      </div>
    </div>
  );
}
