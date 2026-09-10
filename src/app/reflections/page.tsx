"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useHub } from "../providers";
import { ReflectionEditor } from "@/components/ReflectionEditor";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function isDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function pretty(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ReflectionsInner() {
  const { current, loading } = useHub();
  const params = useSearchParams();
  const [date, setDate] = useState(todayStr());
  const [dates, setDates] = useState<string[]>([]);

  // Date is driven by the URL. On any navigation to this page, honor an
  // explicit ?date=YYYY-MM-DD (e.g. from a calendar edit link); otherwise
  // reset to today. Because this reacts to the search params — not just mount —
  // returning here via the sidebar always lands on today, never a stale date.
  useEffect(() => {
    const q = params.get("date");
    setDate(isDate(q) ? q : todayStr());
  }, [params]);

  const refreshDates = useCallback(() => {
    if (!current) return;
    fetch(`/api/reflections?project=${encodeURIComponent(current.slug)}`)
      .then((r) => r.json())
      .then((res) => setDates(res?.dates ?? []));
  }, [current]);

  useEffect(() => {
    refreshDates();
  }, [refreshDates, date]);

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return (
      <div className="empty-state">
        <h2>No project selected</h2>
        <p>Create or pick a project first.</p>
      </div>
    );

  return (
    <div>
      <div className="page-head">
        <div className="label">{current.name}</div>
        <h1>Reflections</h1>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 18 }}
      >
        <div className="card">
          <div className="row between" style={{ marginBottom: 16 }}>
            <div className="label">Entry for</div>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value || todayStr())}
              style={{ width: "auto" }}
            />
          </div>
          {/* key forces a remount (fresh load + save state) when date changes.
              onSaved refreshes the past-entries list so a brand-new date shows
              up immediately, no manual refresh. */}
          <ReflectionEditor
            key={date}
            project={current.slug}
            date={date}
            onSaved={refreshDates}
          />
        </div>

        <div className="card">
          <div className="label" style={{ marginBottom: 12 }}>
            Past entries · {dates.length}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {dates.length === 0 && (
              <div className="muted" style={{ fontSize: 14 }}>
                No reflections yet.
              </div>
            )}
            {dates.map((d) => (
              <button
                key={d}
                className={`nav-link ${d === date ? "active" : ""}`}
                style={{ justifyContent: "space-between" }}
                onClick={() => setDate(d)}
              >
                <span>{pretty(d)}</span>
                {d === todayStr() && <span className="chip">today</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReflectionsPage() {
  // useSearchParams requires a Suspense boundary.
  return (
    <Suspense fallback={<div className="muted">Loading…</div>}>
      <ReflectionsInner />
    </Suspense>
  );
}
