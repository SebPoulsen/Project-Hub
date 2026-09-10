"use client";

import { useEffect, useMemo, useState } from "react";
import { useHub } from "../providers";
import { DayDetail } from "@/components/DayDetail";
import type { TodosFile, Todo } from "@/lib/todos";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Local (not UTC) YYYY-MM-DD to keep calendar cells timezone-correct. */
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  const { current, loading } = useHub();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [reflectionDates, setReflectionDates] = useState<Set<string>>(new Set());
  const [todosByDate, setTodosByDate] = useState<Record<string, Todo[]>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/reflections?project=${encodeURIComponent(current.slug)}`)
      .then((r) => r.json())
      .then((res) => setReflectionDates(new Set<string>(res?.dates ?? [])));
    fetch(`/api/todos?project=${encodeURIComponent(current.slug)}`)
      .then((r) => r.json())
      .then((res: TodosFile) => {
        const byDate: Record<string, Todo[]> = {};
        (res.items ?? []).forEach((t) => {
          if (t.due) (byDate[t.due] ??= []).push(t);
        });
        setTodosByDate(byDate);
      });
  }, [current]);

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
          <div className="row">
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
            const day = Number(date.slice(8, 10));
            return (
              <div
                key={date}
                className={`cal-cell ${date === today ? "today" : ""} ${
                  hasReflection ? "has" : ""
                }`}
                onClick={() => setSelected(date)}
                style={{ cursor: "pointer" }}
              >
                <span className="cal-num">{day}</span>
                <div className="row" style={{ gap: 4 }}>
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

        <div className="row" style={{ gap: 16, marginTop: 16 }}>
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
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
