"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHub } from "../providers";
import { DayDetail } from "@/components/DayDetail";
import { EventEditor } from "@/components/EventEditor";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { PlacementFilter } from "@/components/PlacementFilter";
import { placementMatches, type PlacementFilterValue } from "@/lib/placement-tag";
import type { TodosFile, Todo } from "@/lib/todos";
import type { CalendarEvent } from "@/lib/events";
import type { Company } from "@/lib/companies";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Local (not UTC) YYYY-MM-DD to keep calendar cells timezone-correct. */
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type EditorState = { event: CalendarEvent | null; date: string } | null;

export default function CalendarPage() {
  const { current, loading } = useHub();
  const { scheduleDelete } = usePendingDeletes();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [reflectionDates, setReflectionDates] = useState<Set<string>>(new Set());
  const [todosByDate, setTodosByDate] = useState<Record<string, Todo[]>>({});
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [pendingEventIds, setPendingEventIds] = useState<Set<string>>(new Set());
  const [placeFilter, setPlaceFilter] = useState<PlacementFilterValue>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);

  const slug = current?.slug;

  const loadEvents = useCallback(async () => {
    if (!slug) return;
    const res = await fetch(
      `/api/events?project=${encodeURIComponent(slug)}`
    ).then((r) => r.json());
    setEvents(res?.items ?? []);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/reflections?project=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((res) => setReflectionDates(new Set<string>(res?.dates ?? [])));
    fetch(`/api/todos?project=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((res: TodosFile) => {
        const byDate: Record<string, Todo[]> = {};
        (res.items ?? []).forEach((t) => {
          if (t.due) (byDate[t.due] ??= []).push(t);
        });
        setTodosByDate(byDate);
      });
    fetch(`/api/companies?project=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((res) => setCompanies(res?.items ?? []));
    loadEvents();
  }, [slug, loadEvents]);

  // Deep-link: /calendar?date=<YYYY-MM-DD> (e.g. from a company's event chip)
  // opens that day's detail once, after the project is ready.
  const didOpenParam = useRef(false);
  useEffect(() => {
    if (didOpenParam.current || !slug) return;
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      didOpenParam.current = true;
      setSelected(d);
      setCursor(new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1));
    }
  }, [slug]);

  // Events grouped by date, after placement filter and hiding pending deletes.
  const eventsByDate = useMemo(() => {
    const byDate: Record<string, CalendarEvent[]> = {};
    events
      .filter(
        (e) =>
          !pendingEventIds.has(e.id) && placementMatches(e.placement, placeFilter)
      )
      .forEach((e) => (byDate[e.date] ??= []).push(e));
    return byDate;
  }, [events, pendingEventIds, placeFilter]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (string | null)[] = [];
    for (let i = 0; i < lead; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(ymd(new Date(year, month, d)));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const deleteEvent = useCallback(
    (e: CalendarEvent) => {
      if (!slug) return;
      setPendingEventIds((s) => new Set(s).add(e.id));
      scheduleDelete({
        label: `Deleted “${e.title}”`,
        perform: async () => {
          await fetch(
            `/api/events?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(e.id)}`,
            { method: "DELETE", keepalive: true }
          );
          await loadEvents();
        },
        onUndo: () =>
          setPendingEventIds((s) => {
            const n = new Set(s);
            n.delete(e.id);
            return n;
          }),
      });
    },
    [slug, scheduleDelete, loadEvents]
  );

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return (
      <div className="empty-state">
        <h2>No project selected</h2>
        <p>Create or pick a project first.</p>
      </div>
    );

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const today = ymd(new Date());

  return (
    <div>
      <div className="page-head">
        <div className="label">{current.name}</div>
        <h1>Calendar</h1>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{monthLabel}</h3>
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-accent"
              onClick={() =>
                setEditor({ event: null, date: selected ?? today })
              }
            >
              + Add event
            </button>
            <button
              className="btn"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
            >
              ←
            </button>
            <button
              className="btn"
              onClick={() => {
                const n = new Date();
                setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
              }}
            >
              Today
            </button>
            <button
              className="btn"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }
            >
              →
            </button>
          </div>
        </div>

        <div className="row between" style={{ marginBottom: 14 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Filter events
          </span>
          <PlacementFilter value={placeFilter} onChange={setPlaceFilter} />
        </div>

        <div className="cal-grid" style={{ marginBottom: 6 }}>
          {DOW.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="cal-cell empty" />;
            const hasReflection = reflectionDates.has(date);
            const hasDue = (todosByDate[date]?.length ?? 0) > 0;
            const hasEvent = (eventsByDate[date]?.length ?? 0) > 0;
            const day = Number(date.slice(8, 10));
            return (
              <div
                key={date}
                className={`cal-cell ${date === today ? "today" : ""} ${
                  hasReflection || hasEvent ? "has" : ""
                }`}
                onClick={() => setSelected(date)}
                style={{ cursor: "pointer" }}
              >
                <span className="cal-num">{day}</span>
                <div className="row" style={{ gap: 4 }}>
                  {hasEvent && (
                    <span
                      className="cal-dot"
                      style={{ background: "var(--event)" }}
                      title="Event"
                    />
                  )}
                  {hasReflection && <span className="cal-dot" title="Reflection" />}
                  {hasDue && (
                    <span
                      className="cal-dot"
                      style={{ background: "var(--muted)" }}
                      title="To-do due"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="row" style={{ gap: 16, marginTop: 16, flexWrap: "wrap" }}>
          <span className="row" style={{ gap: 6 }}>
            <span
              className="cal-dot"
              style={{ background: "var(--event)" }}
            />{" "}
            <span className="muted" style={{ fontSize: 13 }}>
              Event
            </span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <span className="cal-dot" />{" "}
            <span className="muted" style={{ fontSize: 13 }}>
              Reflection
            </span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <span className="cal-dot" style={{ background: "var(--muted)" }} />{" "}
            <span className="muted" style={{ fontSize: 13 }}>
              To-do due
            </span>
          </span>
        </div>
      </div>

      {selected && (
        <DayDetail
          project={current.slug}
          date={selected}
          todos={todosByDate[selected] ?? []}
          events={eventsByDate[selected] ?? []}
          companies={companies}
          onAddEvent={() => setEditor({ event: null, date: selected })}
          onEditEvent={(e) => setEditor({ event: e, date: e.date })}
          onDeleteEvent={deleteEvent}
          onClose={() => setSelected(null)}
        />
      )}

      {editor && (
        <EventEditor
          project={current.slug}
          event={editor.event}
          date={editor.date}
          companies={companies}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            loadEvents();
          }}
        />
      )}
    </div>
  );
}
