"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReflectionData } from "@/lib/reflections";
import type { Todo } from "@/lib/todos";

function pretty(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function reflectionSnippet(r: ReflectionData): string {
  return [r.noticed, r.learned, r.clearer, r.notes]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Day-detail popover shown when a calendar date is clicked. Shows BOTH that
 * day's reflection (if any) and any to-dos due that day, each with an edit link.
 */
export function DayDetail({
  project,
  date,
  todos,
  onClose,
}: {
  project: string;
  date: string;
  todos: Todo[];
  onClose: () => void;
}) {
  const [reflection, setReflection] = useState<ReflectionData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/reflections?project=${encodeURIComponent(project)}&date=${encodeURIComponent(date)}`
    )
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setReflection(res?.data ?? null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [project, date]);

  const snippet = reflection ? reflectionSnippet(reflection) : "";
  const hasReflection = snippet.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{pretty(date)}</h3>
          <button className="btn btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* To-dos first, then the reflection (which can be long). */}
        <div className="modal-section">
          <div className="label" style={{ marginBottom: 8 }}>
            To-dos due · {todos.length}
          </div>
          {todos.length === 0 ? (
            <div className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
              Nothing due this day.
            </div>
          ) : (
            <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
              {todos.map((t) => (
                <div key={t.id} className="row" style={{ gap: 8 }}>
                  <span
                    style={{
                      color: t.done ? "var(--muted)" : "var(--accent)",
                    }}
                  >
                    {t.done ? "✓" : "○"}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      textDecoration: t.done ? "line-through" : "none",
                      color: t.done ? "var(--muted)" : "var(--text)",
                    }}
                  >
                    {t.text}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link href="/todos" className="link-accent">
            Manage to-dos →
          </Link>
        </div>

        <div className="modal-section">
          <div className="label" style={{ marginBottom: 6 }}>
            Reflection
          </div>
          {!loaded ? (
            <div className="muted" style={{ fontSize: 14 }}>
              Loading…
            </div>
          ) : hasReflection ? (
            <>
              {/* Full text, scrollable so a long entry is readable in-place. */}
              <div className="reflection-snippet">{snippet}</div>
              <Link href={`/reflections?date=${date}`} className="link-accent">
                Edit reflection →
              </Link>
            </>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
                No reflection for this day.
              </div>
              <Link href={`/reflections?date=${date}`} className="link-accent">
                Add reflection →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
