"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useScrollLock } from "@/lib/useScrollLock";
import { PLACEMENT_LABEL } from "@/lib/placement-tag";
import type { ReflectionData } from "@/lib/reflections";
import type { Todo } from "@/lib/todos";
import type { CalendarEvent } from "@/lib/events";
import type { Company } from "@/lib/companies";

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

/** "14:00–16:00", "14:00", or "All day" when no time is set. */
function timeLabel(e: CalendarEvent): string {
  if (!e.startTime) return "All day";
  return e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime;
}

/**
 * Day-detail popover shown when a calendar date is clicked. Shows, in order:
 * that day's Events (scheduled things, with add/edit/delete), To-dos due, and
 * the day's Reflection (kept last as it can be long). Event mutation state is
 * owned by the calendar and delegated here via callbacks, so a soft-delete's
 * undo survives this popover closing.
 */
export function DayDetail({
  project,
  date,
  todos,
  events,
  companies,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onClose,
}: {
  project: string;
  date: string;
  todos: Todo[];
  events: CalendarEvent[];
  companies: Company[];
  onAddEvent: () => void;
  onEditEvent: (e: CalendarEvent) => void;
  onDeleteEvent: (e: CalendarEvent) => void;
  onClose: () => void;
}) {
  const [reflection, setReflection] = useState<ReflectionData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useScrollLock(); // lock background scroll while the popover is open
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

  const companyName = (id: string | null) =>
    id ? companies.find((c) => c.id === id)?.name ?? null : null;

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

        {/* Events first (scheduled things), then to-dos, then the reflection. */}
        <div className="modal-section">
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="label">Events · {events.length}</span>
            <button className="btn btn-ghost" onClick={onAddEvent}>
              + Add event
            </button>
          </div>
          {events.length === 0 ? (
            <div className="muted" style={{ fontSize: 14 }}>
              Nothing scheduled this day.
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {events.map((e) => {
                const cname = companyName(e.companyId);
                return (
                  <div key={e.id} className="event-row">
                    <div className="row between" style={{ gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                          <span className="event-time">{timeLabel(e)}</span>
                          <span className="event-title">{e.title}</span>
                        </div>
                        {(cname || e.placement || e.notes) && (
                          <div
                            className="row"
                            style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}
                          >
                            {cname && (
                              <Link
                                href={`/companies?focus=${encodeURIComponent(e.companyId as string)}`}
                                className="chip chip-research"
                              >
                                🏢 {cname}
                              </Link>
                            )}
                            {e.placement && (
                              <span className="chip chip-placement">
                                {PLACEMENT_LABEL[e.placement]}
                              </span>
                            )}
                          </div>
                        )}
                        {e.notes && (
                          <div
                            className="muted"
                            style={{
                              fontSize: 13,
                              marginTop: 4,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {e.notes}
                          </div>
                        )}
                      </div>
                      <div className="row" style={{ gap: 2, flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "4px 8px" }}
                          onClick={() => onEditEvent(e)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost danger"
                          style={{ padding: "4px 8px" }}
                          onClick={() => onDeleteEvent(e)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
