"use client";

import Link from "next/link";
import { useHub } from "./providers";
import { ReflectionEditor } from "@/components/ReflectionEditor";
import { TodoList } from "@/components/TodoList";
import { DashboardEvents } from "@/components/DashboardEvents";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function prettyDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function Dashboard() {
  const { current, loading, createProject } = useHub();
  const date = todayStr();

  if (loading) return <div className="muted">Loading…</div>;

  if (!current) {
    return (
      <div className="empty-state">
        <h2>Welcome to Project Hub</h2>
        <p>Create your first project to begin. Everything is stored as plain files in iCloud Drive.</p>
        <div className="spacer-sm" />
        <button
          className="btn btn-accent"
          onClick={() => createProject("My First Project")}
        >
          + Create “My First Project”
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div className="label">{prettyDate(date)} · {current.name}</div>
        <h1>What became clearer today?</h1>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 18 }}
      >
        <div className="card reflection-hero">
          <div className="row between" style={{ marginBottom: 14 }}>
            <div className="label">Today’s reflection</div>
            <Link href="/reflections" className="btn btn-ghost">
              All reflections →
            </Link>
          </div>
          <ReflectionEditor project={current.slug} date={date} />
        </div>

        <div className="stack">
          <div className="card">
            <div className="row between" style={{ marginBottom: 6 }}>
              <div className="label">Today’s to-dos</div>
              <Link href="/todos" className="btn btn-ghost">
                Manage →
              </Link>
            </div>
            <TodoList
              project={current.slug}
              only={["overdue", "today"]}
              showAdd={false}
            />
          </div>

          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="label">Events</div>
              <Link href="/calendar" className="btn btn-ghost">
                Calendar →
              </Link>
            </div>
            <DashboardEvents project={current.slug} />
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 10 }}>
              Quick links
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <Link href="/notes" className="btn" style={{ width: "100%" }}>
                ❏ New note / photo
              </Link>
              <Link href="/calendar" className="btn" style={{ width: "100%" }}>
                ▦ Calendar
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
