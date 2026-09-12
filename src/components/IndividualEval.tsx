"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  CATEGORY_LABEL,
  REFLECTION_PROMPTS,
  emptyIndividual,
  emptyReflections,
  type EvalCategory,
  type EvalItem,
  type EvalReflections,
  type EvalSet,
  type IndividualEval as IndividualEvalData,
} from "@/lib/evaluations-shared";

const CATEGORIES: EvalCategory[] = ["skill", "knowledge", "attitude", "wildcard"];
const DEBOUNCE_MS = 1500;
type SaveState = "idle" | "dirty" | "saving" | "saved";

function ratedAverage(set: EvalSet): number | null {
  const vals = Object.values(set.ratings);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function IndividualEval({ project }: { project: string }) {
  const { scheduleDelete } = usePendingDeletes();
  const [data, setData] = useState<IndividualEvalData>(emptyIndividual());
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SaveState>("idle");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ kind: "add" } | { kind: "edit"; set: EvalSet } | null>(
    null
  );
  const [highlightSetId, setHighlightSetId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const latest = useRef<{ goal: string; items: EvalItem[] }>({ goal: "", items: [] });
  latest.current = { goal: data.goal, items: data.items };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/evaluations/individual?project=${encodeURIComponent(project)}`
    ).then((r) => r.json());
    const merged: IndividualEvalData = { ...emptyIndividual(), ...res };
    setData(merged);
    return merged;
  }, [project]);

  // Initial load: fold the setup section only once it's fully set up — all 14
  // items labelled AND at least one evaluation created — so the chart takes
  // focus from then on. Otherwise start open (first use / still labelling).
  useEffect(() => {
    setLoading(true);
    load()
      .then((merged) => {
        const complete = merged.items.every((i) => i.label.trim());
        const foldByDefault = complete && merged.sets.length > 0;
        setSetupOpen(!foldByDefault);
      })
      .finally(() => setLoading(false));
  }, [load]);

  // Setup autosave (goal + item labels).
  const save = useCallback(async () => {
    setState("saving");
    await fetch(`/api/evaluations/individual?project=${encodeURIComponent(project)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: latest.current.goal,
        items: latest.current.items.map((i) => ({ id: i.id, label: i.label })),
      }),
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

  const updateGoal = (goal: string) => {
    setData((d) => ({ ...d, goal }));
    scheduleSave();
  };
  const updateItemLabel = (id: string, label: string) => {
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, label } : i)),
    }));
    scheduleSave();
  };
  const flushOnBlur = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (state === "dirty" || state === "saving") save();
  };

  async function saveSet(
    name: string,
    ratings: Record<string, number>,
    reflections: EvalReflections
  ) {
    if (modal?.kind === "edit") {
      await fetch(
        `/api/evaluations/individual?project=${encodeURIComponent(project)}&setId=${encodeURIComponent(modal.set.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, ratings, reflections }),
        }
      );
    } else {
      await fetch(`/api/evaluations/individual?project=${encodeURIComponent(project)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ratings, reflections }),
      });
    }
    setModal(null);
    load();
  }

  function removeSet(set: EvalSet) {
    setPendingIds((p) => new Set(p).add(set.id));
    scheduleDelete({
      label: `Evaluation "${set.name}" deleted`,
      perform: async () => {
        await fetch(
          `/api/evaluations/individual?project=${encodeURIComponent(project)}&setId=${encodeURIComponent(set.id)}`,
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
    const list = data.sets.filter((s) => !pendingIds.has(s.id));
    if (list.length === 0) return;
    const header = [
      "Individual evaluation",
      data.goal.trim() ? `Goal: ${data.goal.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const formatSet = (s: EvalSet) => {
      const lines = [`## ${s.name}`];
      for (const cat of CATEGORIES) {
        lines.push(CATEGORY_LABEL[cat]);
        for (const it of data.items.filter((i) => i.category === cat)) {
          const r = s.ratings[it.id];
          lines.push(`- ${it.label || "(unlabelled)"}: ${r ?? "—"}`);
        }
      }
      const refl = REFLECTION_PROMPTS.filter((p) => s.reflections[p.key]?.trim());
      if (refl.length) {
        lines.push("", "Reflection");
        for (const p of refl) lines.push(`${p.label} ${s.reflections[p.key].trim()}`);
      }
      return lines.join("\n");
    };
    const text = `${header}\n\n${list
      .map(formatSet)
      .join("\n\n────────────────────────\n\n")}`;
    if (await copyPlainText(text)) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  }

  if (loading) return <div className="muted">Loading…</div>;

  const label =
    state === "saving"
      ? "Saving…"
      : state === "dirty"
      ? "Unsaved changes"
      : state === "saved"
      ? "Saved ✓"
      : "";
  const visibleSets = data.sets.filter((s) => !pendingIds.has(s.id));
  const setupComplete = data.items.every((i) => i.label.trim());

  return (
    <div className="stack" style={{ gap: 22 }}>
      {/* Setup — collapsible; collapses once complete so the chart takes focus */}
      <div className="card">
        <div className="row between">
          <button
            className="rq-head"
            onClick={() => setSetupOpen((o) => !o)}
            aria-expanded={setupOpen}
          >
            <span className={`chev ${setupOpen ? "open" : ""}`}>›</span>
            <span className="label" style={{ padding: 0 }}>
              Goal &amp; items (setup)
            </span>
          </button>
          {setupOpen ? (
            <span className={`save-state ${state === "saving" ? "saving" : ""}`}>
              {label}
            </span>
          ) : (
            <button className="btn btn-ghost" onClick={() => setSetupOpen(true)}>
              Edit setup
            </button>
          )}
        </div>

        {setupOpen ? (
          <div style={{ marginTop: 14 }}>
            <label className="stack" style={{ gap: 4, marginBottom: 16 }}>
              <span className="label">Goal / outcome</span>
              <textarea
                placeholder="What are you working toward? The items below are rated against this."
                value={data.goal}
                onChange={(e) => updateGoal(e.target.value)}
                onBlur={flushOnBlur}
                style={{ minHeight: 70 }}
              />
            </label>

            <div className="grid grid-2" style={{ gap: 18 }}>
              {CATEGORIES.map((cat) => (
                <div key={cat}>
                  <div className="label" style={{ marginBottom: 6 }}>
                    {CATEGORY_LABEL[cat]}
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    {data.items
                      .filter((i) => i.category === cat)
                      .map((i, idx) => (
                        <input
                          key={i.id}
                          type="text"
                          placeholder={`${CATEGORY_LABEL[cat]} ${idx + 1}`}
                          value={i.label}
                          onChange={(e) => updateItemLabel(i.id, e.target.value)}
                          onBlur={flushOnBlur}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 14, marginTop: 8 }}>
            {data.goal ? data.goal : "No goal set."}
          </div>
        )}
      </div>

      {/* Evaluation sets */}
      <div>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }} className="serif">
            Evaluations
          </h2>
          <div className="row" style={{ gap: 6 }}>
            {visibleSets.length > 0 && (
              <button className="btn btn-ghost" onClick={copyAll}>
                {copiedAll ? "Copied ✓" : "Copy all"}
              </button>
            )}
            <button
              className="btn btn-accent"
              onClick={() => setModal({ kind: "add" })}
              disabled={!setupComplete}
              title={setupComplete ? "" : "Label all 14 items first"}
            >
              + Add evaluation
            </button>
          </div>
        </div>

        {!setupComplete && (
          <div className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
            Label all 14 items above to start adding evaluations.
          </div>
        )}

        {visibleSets.length === 0 ? (
          <div className="tempty">No evaluations yet.</div>
        ) : (
          <>
            {/* Chart: one dashed line per set across the 14 grouped items. */}
            <div className="card" style={{ marginBottom: 14 }}>
              <RatingLineChart
                columns={data.items.map(
                  (i): ChartColumn => ({
                    key: i.id,
                    label: i.label || "Item",
                    group: CATEGORY_LABEL[i.category],
                  })
                )}
                series={visibleSets.map(
                  (s, idx): ChartSeries => ({
                    id: s.id,
                    name: s.name,
                    color: setColor(idx),
                    values: s.ratings,
                  })
                )}
                highlightId={highlightSetId}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Each line is an evaluation across all 14 items. Select one below to
                highlight it.
              </div>
            </div>

            {/* Sets list — legend (color swatch) + select-to-highlight + CRUD. */}
            <div className="stack" style={{ gap: 8 }}>
              {visibleSets.map((s, idx) => {
                const avg = ratedAverage(s);
                const on = highlightSetId === s.id;
                const hasReflections = Object.values(s.reflections).some((t) =>
                  t.trim()
                );
                return (
                  <div
                    key={s.id}
                    className={`card eval-set-row ${on ? "on" : ""}`}
                    style={{ padding: "12px 16px", cursor: "pointer" }}
                    onClick={() =>
                      setHighlightSetId((h) => (h === s.id ? null : s.id))
                    }
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
                            {Object.keys(s.ratings).length}/14 rated
                            {hasReflections ? " · has notes" : ""}
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
      </div>

      {modal && (
        <EvalSetModal
          items={data.items}
          initial={modal.kind === "edit" ? modal.set : null}
          onClose={() => setModal(null)}
          onSave={saveSet}
        />
      )}
    </div>
  );
}

function EvalSetModal({
  items,
  initial,
  onClose,
  onSave,
}: {
  items: EvalItem[];
  initial: EvalSet | null;
  onClose: () => void;
  onSave: (
    name: string,
    ratings: Record<string, number>,
    reflections: EvalReflections
  ) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [ratings, setRatings] = useState<Record<string, number>>(
    initial?.ratings ?? {}
  );
  const [reflections, setReflections] = useState<EvalReflections>(
    initial?.reflections ?? emptyReflections()
  );
  const [busy, setBusy] = useState(false);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setRating = (id: string, v: number) =>
    setRatings((r) => ({ ...r, [id]: v }));

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    await onSave(name.trim(), ratings, reflections);
    setBusy(false);
  }

  const ratedCount = Object.keys(ratings).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 620 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>
            {initial ? "Edit evaluation" : "Add evaluation"}
          </h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <label className="stack" style={{ gap: 4, marginBottom: 14 }}>
          <span className="label">Name</span>
          <input
            type="text"
            autoFocus
            placeholder="e.g. Pre, Midway, Post, Supervisor"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="stack" style={{ gap: 14 }}>
          {CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="label" style={{ marginBottom: 6 }}>
                {CATEGORY_LABEL[cat]}
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {items
                  .filter((i) => i.category === cat)
                  .map((i) => (
                    <div key={i.id} className="row between" style={{ gap: 12 }}>
                      <span style={{ fontSize: 14, flex: 1, minWidth: 0 }}>
                        {i.label || <span className="muted">(unlabelled)</span>}
                      </span>
                      <select
                        className="rating-select"
                        value={ratings[i.id] ?? ""}
                        onChange={(e) =>
                          e.target.value
                            ? setRating(i.id, Number(e.target.value))
                            : setRatings((r) => {
                                const n = { ...r };
                                delete n[i.id];
                                return n;
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
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="stack" style={{ gap: 18, marginTop: 20 }}>
          <div className="label">Reflection (optional)</div>
          {REFLECTION_PROMPTS.map((p) => (
            <label className="stack" style={{ gap: 4 }} key={p.key}>
              <span className="muted" style={{ fontSize: 13 }}>
                {p.label}
              </span>
              <textarea
                value={reflections[p.key]}
                onChange={(e) =>
                  setReflections((r) => ({ ...r, [p.key]: e.target.value }))
                }
                style={{ minHeight: 56 }}
              />
            </label>
          ))}
        </div>

        <div className="row between" style={{ marginTop: 18 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {ratedCount}/14 rated
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={submit}
              disabled={busy || !name.trim()}
            >
              {busy ? "Saving…" : initial ? "Save changes" : "Save evaluation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
