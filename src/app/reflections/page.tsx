"use client";

import { useEffect, useState } from "react";
import { useHub } from "../providers";
import { ReflectionEditor } from "@/components/ReflectionEditor";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function pretty(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ReflectionsPage() {
  const { current, loading } = useHub();
  const [date, setDate] = useState(todayStr());
  const [dates, setDates] = useState<string[]>([]);

  // Honor ?date=YYYY-MM-DD (e.g. from a calendar click) without needing a
  // Suspense boundary around useSearchParams.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) setDate(q);
  }, []);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/reflections?project=${encodeURIComponent(current.slug)}`)
      .then((r) => r.json())
      .then((res) => setDates(res?.dates ?? []));
  }, [current, date]);

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return <div className="empty-state"><h2>No project selected</h2><p>Create or pick a project first.</p></div>;

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
          {/* key forces a remount (fresh load + save state) when date changes */}
          <ReflectionEditor key={date} project={current.slug} date={date} />
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
