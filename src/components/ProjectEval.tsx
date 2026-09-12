"use client";

import { useCallback, useEffect, useState } from "react";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { useScrollLock } from "@/lib/useScrollLock";
import { copyPlainText } from "@/lib/clipboard";
import {
  RatingLineChart,
  setColor,
  type ChartColumn,
  type ChartSeries,
} from "@/components/RatingLineChart";
import {
  PROJECT_ROWS,
  emptyProjectRows,
  type ProjectEvalSet,
  type ProjectRows,
} from "@/lib/evaluations-shared";

const CHART_COLUMNS: ChartColumn[] = PROJECT_ROWS.map((r) => ({
  key: r.key,
  label: r.short,
}));

function ratedAverage(rows: ProjectRows): number | null {
  const vals = Object.values(rows)
    .map((r) => r.rating)
    .filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Project-level evaluations — same sets model as the individual track, but the
 * 5 rows are fixed (no setup phase). Freely-named sets (e.g. own Pre/Midway/Post
 * vs a supervisor's) plotted on one chart for comparison.
 */
export function ProjectEval({ project }: { project: string }) {
  const { scheduleDelete } = usePendingDeletes();
  const [sets, setSets] = useState<ProjectEvalSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [modal, setModal] = useState<
    { kind: "add" } | { kind: "edit"; set: ProjectEvalSet } | null
  >(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/evaluations/project?project=${encodeURIComponent(project)}`
    ).then((r) => r.json());
    setSets(res?.sets ?? []);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function saveSet(name: string, rows: ProjectRows) {
    if (modal?.kind === "edit") {
      await fetch(
        `/api/evaluations/project?project=${encodeURIComponent(project)}&setId=${encodeURIComponent(modal.set.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, rows }),
        }
      );
    } else {
      await fetch(`/api/evaluations/project?project=${encodeURIComponent(project)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rows }),
      });
    }
    setModal(null);
    load();
  }

  function removeSet(set: ProjectEvalSet) {
    setPendingIds((p) => new Set(p).add(set.id));
    scheduleDelete({
      label: `Evaluation "${set.name}" deleted`,
      perform: async () => {
        await fetch(
          `/api/evaluations/project?project=${encodeURIComponent(project)}&setId=${encodeURIComponent(set.id)}`,
          { method: "DELETE", keepalive: true }
        );
      },
      onUndo: () =>
        setPendingIds((p) => {
          const n = new Set(p);
          n.delete(set.id);
          return n;
        }),
    });
  }

  async function copyAll() {
    const list = sets.filter((s) => !pendingIds.has(s.id));
    if (list.length === 0) return;
    const formatSet = (s: ProjectEvalSet) => {
      const lines = [`## ${s.name}`];
      for (const row of PROJECT_ROWS) {
        const cell = s.rows[row.key];
        lines.push(`${row.label}: ${cell?.rating ?? "—"}`);
        if (cell?.text?.trim()) lines.push(`  ${cell.text.trim()}`);
      }
      return lines.join("\n");
    };
    const text = `Project-level evaluation\n\n${list
      .map(formatSet)
      .join("\n\n────────────────────────\n\n")}`;
    if (await copyPlainText(text)) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  }

  if (loading) return <div className="muted">Loading…</div>;

  const visibleSets = sets.filter((s) => !pendingIds.has(s.id));

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14, maxWidth: 560 }}>
          Rate the five dimensions 1–10 with your reasoning. Add multiple named
          evaluations (e.g. your own Pre/Post and a supervisor’s) to compare them
          on one chart.
        </p>
        <div className="row" style={{ gap: 6 }}>
          {visibleSets.length > 0 && (
            <button className="btn btn-ghost" onClick={copyAll}>
              {copiedAll ? "Copied ✓" : "Copy all"}
            </button>
          )}
          <button className="btn btn-accent" onClick={() => setModal({ kind: "add" })}>
            + Add evaluation
          </button>
        </div>
      </div>

      {visibleSets.length === 0 ? (
        <div className="empty-state">
          <h2>No evaluations yet</h2>
          <p>Add your first project-level evaluation to begin.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <RatingLineChart
              columns={CHART_COLUMNS}
              series={visibleSets.map(
                (s, idx): ChartSeries => ({
                  id: s.id,
                  name: s.name,
                  color: setColor(idx),
                  values: Object.fromEntries(
                    PROJECT_ROWS.map((r) => [r.key, s.rows[r.key]?.rating ?? null])
                  ),
                })
              )}
              highlightId={highlightId}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Each line is an evaluation across the five dimensions. Select one
              below to highlight it.
            </div>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            {visibleSets.map((s, idx) => {
              const avg = ratedAverage(s.rows);
              const rated = PROJECT_ROWS.filter(
                (r) => s.rows[r.key]?.rating != null
              ).length;
              const on = highlightId === s.id;
              return (
                <div
                  key={s.id}
                  className={`card eval-set-row ${on ? "on" : ""}`}
                  style={{ padding: "12px 16px", cursor: "pointer" }}
                  onClick={() => setHighlightId((h) => (h === s.id ? null : s.id))}
                >
                  <div className="row between">
                    <div className="row" style={{ gap: 10 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 14,
                          height: 3,
                          borderRadius: 2,
                          marginTop: 8,
                          flex: "0 0 auto",
                          background: setColor(idx),
                        }}
                      />
                      <div>
                        <h3 style={{ margin: 0, fontSize: 16 }}>{s.name}</h3>
                        <span className="muted" style={{ fontSize: 13 }}>
                          {avg != null ? `avg ${avg.toFixed(1)} · ` : ""}
                          {rated}/5 rated
                        </span>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        className="btn btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModal({ kind: "edit", set: s });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSet(s);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal && (
        <ProjectSetModal
          initial={modal.kind === "edit" ? modal.set : null}
          onClose={() => setModal(null)}
          onSave={saveSet}
        />
      )}
    </div>
  );
}

function ProjectSetModal({
  initial,
  onClose,
  onSave,
}: {
  initial: ProjectEvalSet | null;
  onClose: () => void;
  onSave: (name: string, rows: ProjectRows) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [rows, setRows] = useState<ProjectRows>(
    initial ? { ...emptyProjectRows(), ...initial.rows } : emptyProjectRows()
  );
  const [busy, setBusy] = useState(false);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setRow(key: string, patch: Partial<{ rating: number | null; text: string }>) {
    setRows((r) => ({ ...r, [key]: { ...r[key], ...patch } }));
  }

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    await onSave(name.trim(), rows);
    setBusy(false);
  }

  const rated = PROJECT_ROWS.filter((r) => rows[r.key]?.rating != null).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>{initial ? "Edit evaluation" : "Add evaluation"}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <label className="stack" style={{ gap: 4, marginBottom: 14 }}>
          <span className="label">Name</span>
          <input
            type="text"
            autoFocus
            placeholder="e.g. Pre, Post, Supervisor — Midway"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div>
          {PROJECT_ROWS.map((row) => (
            <div key={row.key} className="eval-row-group">
              <div
                className="row between eval-row-head"
                style={{ alignItems: "flex-start", gap: 12 }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0 }}>
                  {row.label}
                </span>
                <select
                  className="rating-select"
                  value={rows[row.key]?.rating ?? ""}
                  onChange={(e) =>
                    setRow(row.key, {
                      rating: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  style={{ width: 80, flex: "0 0 auto" }}
                >
                  <option value="">—</option>
                  {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Notes / reasoning…"
                value={rows[row.key]?.text ?? ""}
                onChange={(e) => setRow(row.key, { text: e.target.value })}
                style={{ minHeight: 56 }}
              />
            </div>
          ))}
        </div>

        <div className="row between" style={{ marginTop: 18 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {rated}/5 rated
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-accent" onClick={submit} disabled={busy || !name.trim()}>
              {busy ? "Saving…" : initial ? "Save changes" : "Save evaluation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
