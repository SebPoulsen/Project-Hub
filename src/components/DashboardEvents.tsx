"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent } from "@/lib/events";

/** Local (not UTC) YYYY-MM-DD, matching the calendar's day keys. */
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeLabel(e: CalendarEvent): string {
  if (!e.startTime) return "All day";
  return e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime;
}

function shortDay(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Glance-only events for the dashboard — today's events plus anything in the
 * next 7 days. No add/edit here (mirrors the dashboard to-do list): the calendar
 * is where events are managed. Past events aren't surfaced — unlike an overdue
 * to-do, a past event needs no action.
 */
const UPCOMING_DAYS = 7;

export function DashboardEvents({ project }: { project: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setEvents(res?.items ?? []);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [project]);

  if (!loaded)
    return (
      <div className="muted" style={{ fontSize: 14 }}>
        Loading…
      </div>
    );

  const today = ymd(new Date());
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + UPCOMING_DAYS);
  const horizonStr = ymd(horizon);

  const todays = events.filter((e) => e.date === today);
  const upcoming = events.filter((e) => e.date > today && e.date <= horizonStr);

  if (todays.length === 0 && upcoming.length === 0)
    return (
      <div className="muted" style={{ fontSize: 14 }}>
        Nothing scheduled today.
      </div>
    );

  return (
    <div className="stack" style={{ gap: 10 }}>
      {todays.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {todays.map((e) => (
            <div key={e.id} className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <span className="event-time">{timeLabel(e)}</span>
              <span className="titem-text">{e.title}</span>
            </div>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="label" style={{ marginTop: todays.length > 0 ? 2 : 0 }}>
            Upcoming
          </div>
          {upcoming.map((e) => (
            <div key={e.id} className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <span className="muted" style={{ fontSize: 12, minWidth: 78 }}>
                {shortDay(e.date)}
              </span>
              <span className="titem-text" style={{ fontSize: 14 }}>
                {e.startTime ? `${e.startTime} · ` : ""}
                {e.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
