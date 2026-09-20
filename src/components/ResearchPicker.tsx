"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ResearchQuestion } from "@/lib/research";

/**
 * Toggle-chip picker for tagging a reflection or note to one or more research
 * questions. Purely controlled: it owns nothing but the fetched question list
 * (and which questions have their sub-question panel expanded).
 *
 * Tagging is **most-specific-per-tree**: for any one overarching question, the
 * `selected` list holds AT MOST one id from its tree — either the overarching
 * `rq-…` id (tagged to the question as a whole) or one of its sub-question
 * `rs-…` ids (narrowed). Narrowing replaces, it never adds a second id, so a
 * finding is filed once and never double-counts. Tagging the overarching
 * question alone stays the default — narrowing is optional, additive precision.
 */
export function ResearchPicker({
  project,
  selected,
  onChange,
}: {
  project: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [questions, setQuestions] = useState<ResearchQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setQuestions(res?.items ?? []);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [project]);

  /** Every taggable id belonging to a question's tree (itself + its subs). */
  function treeIds(q: ResearchQuestion): string[] {
    return [
      q.id,
      ...(q.groups ?? []).flatMap((g) => g.subQuestions.map((s) => s.id)),
    ];
  }

  /** The one id from this tree currently in `selected`, or null. */
  function selectedInTree(q: ResearchQuestion): string | null {
    const ids = treeIds(q);
    return selected.find((id) => ids.includes(id)) ?? null;
  }

  /** Set (or clear) this tree's single selected id, replacing any prior one. */
  function setTree(q: ResearchQuestion, nextId: string | null) {
    const ids = new Set(treeIds(q));
    const rest = selected.filter((id) => !ids.has(id));
    onChange(nextId ? [...rest, nextId] : rest);
  }

  function toggleTree(q: ResearchQuestion) {
    // On → off entirely; off → on at the overarching level.
    setTree(q, selectedInTree(q) ? null : q.id);
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>
        Research questions
      </div>
      {!loaded ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Loading…
        </div>
      ) : questions.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          No research questions yet.{" "}
          <Link href="/research" className="link-accent">
            Add one →
          </Link>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {questions.map((q) => {
            const cur = selectedInTree(q);
            const on = cur !== null;
            const hasGroups = (q.groups ?? []).some(
              (g) => g.subQuestions.length > 0
            );
            const narrowed = on && cur !== q.id;
            const isOpen = expanded.has(q.id);
            return (
              <div key={q.id}>
                <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                  <button
                    type="button"
                    className={`chip chip-toggle ${on ? "on" : ""}`}
                    onClick={() => toggleTree(q)}
                    title={q.question}
                  >
                    {on ? "✓ " : ""}
                    {q.question}
                  </button>
                  {on && hasGroups && (
                    <button
                      type="button"
                      className="btn btn-ghost rq-narrow-toggle"
                      onClick={() => toggleExpand(q.id)}
                      aria-expanded={isOpen}
                    >
                      {narrowed ? "Sub-question ✓" : "Add to sub-question →"}
                    </button>
                  )}
                </div>

                {on && hasGroups && isOpen && (
                  <div className="rq-narrow">
                    <label className="rq-narrow-opt">
                      <input
                        type="radio"
                        name={`narrow-${q.id}`}
                        checked={cur === q.id}
                        onChange={() => setTree(q, q.id)}
                      />
                      <span className="muted">Whole question (no sub-question)</span>
                    </label>
                    {(q.groups ?? [])
                      .filter((g) => g.subQuestions.length > 0)
                      .map((g) => (
                        <div key={g.id} className="rq-narrow-group">
                          <div className="rq-narrow-grouptitle">{g.title}</div>
                          {g.subQuestions.map((s) => (
                            <label key={s.id} className="rq-narrow-opt">
                              <input
                                type="radio"
                                name={`narrow-${q.id}`}
                                checked={cur === s.id}
                                onChange={() => setTree(q, s.id)}
                              />
                              <span>{s.question}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
