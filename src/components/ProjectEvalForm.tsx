"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROJECT_ROWS,
  emptyProjectEval,
  type ProjectEval,
} from "@/lib/evaluations-shared";

type SaveState = "idle" | "dirty" | "saving" | "saved";
const DEBOUNCE_MS = 1500;

/** Single-pass project-level evaluation: 5 fixed rows, each a 1–10 rating +
 *  free text. Debounced autosave, one commit per save. */
export function ProjectEvalForm({ project }: { project: string }) {
  const [data, setData] = useState<ProjectEval>(emptyProjectEval());
  const [state, setState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const latest = useRef<ProjectEval>(data);
  latest.current = data;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/evaluations/project?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setData({ ...emptyProjectEval(), ...res });
        setState("idle");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [project]);

  const save = useCallback(async () => {
    setState("saving");
    await fetch(`/api/evaluations/project?project=${encodeURIComponent(project)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(latest.current),
      keepalive: true,
    });
    setState("saved");
  }, [project]);

  const scheduleSave = useCallback(() => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, DEBOUNCE_MS);
  }, [save]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const update = (key: string, patch: Partial<{ rating: number | null; text: string }>) => {
    setData((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
    scheduleSave();
  };

  const flushOnBlur = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (state === "dirty" || state === "saving") save();
  };

  if (loading) return <div className="muted">Loading…</div>;

  const label =
    state === "saving"
      ? "Saving…"
      : state === "dirty"
      ? "Unsaved changes"
      : state === "saved"
      ? "Saved ✓"
      : "";

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14, maxWidth: 620 }}>
          A single end-of-project assessment — rate each dimension 1–10 and add
          your reasoning. No timepoints; just fill it in.
        </p>
        <span className={`save-state ${state === "saving" ? "saving" : ""}`}>
          {label}
        </span>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {PROJECT_ROWS.map((row) => (
          <div className="card" key={row.key}>
            <div className="row between" style={{ alignItems: "flex-start", gap: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, flex: 1, minWidth: 0 }}>
                {row.label}
              </h3>
              <label className="row" style={{ gap: 6, flex: "0 0 auto" }}>
                <span className="label">Rating</span>
                <select
                  value={data[row.key].rating ?? ""}
                  onChange={(e) =>
                    update(row.key, {
                      rating: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={flushOnBlur}
                  style={{ width: "auto" }}
                >
                  <option value="">—</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              placeholder="Notes / reasoning…"
              value={data[row.key].text}
              onChange={(e) => update(row.key, { text: e.target.value })}
              onBlur={flushOnBlur}
              style={{ minHeight: 80, marginTop: 10 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
