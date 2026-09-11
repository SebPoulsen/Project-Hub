"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ResearchQuestion } from "@/lib/research";

/**
 * Toggle-chip picker for tagging a reflection or note to one or more research
 * questions. Purely controlled: it owns nothing but the fetched question list.
 * The parent stores the selected ids and persists them in its own save flow.
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

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    );
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
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {questions.map((q) => {
            const on = selected.includes(q.id);
            return (
              <button
                key={q.id}
                type="button"
                className={`chip chip-toggle ${on ? "on" : ""}`}
                onClick={() => toggle(q.id)}
                title={q.question}
              >
                {on ? "✓ " : ""}
                {q.question}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
