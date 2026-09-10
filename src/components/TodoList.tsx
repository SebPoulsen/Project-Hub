"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePendingDeletes } from "@/components/PendingDeletes";
import type { Todos, Todo, Bucket } from "@/lib/todos";

const EMPTY: Todos = { today: [], week: [], later: [] };

const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Today",
  week: "This week",
  later: "Later",
};

function newId() {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/** Local (not UTC) YYYY-MM-DD to avoid timezone off-by-one on due dates. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday–Sunday bounds of the current week, as YYYY-MM-DD. */
function currentWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const offset = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: ymd(monday), end: ymd(sunday) };
}

export function TodoList({
  project,
  buckets = ["today", "week", "later"],
  compact = false,
}: {
  project: string;
  buckets?: Bucket[];
  compact?: boolean;
}) {
  const [todos, setTodos] = useState<Todos>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<Bucket, string>>({
    today: "",
    week: "",
    later: "",
  });
  const [dueDrafts, setDueDrafts] = useState<Record<Bucket, string>>({
    today: "",
    week: "",
    later: "",
  });
  const week = currentWeekBounds();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Todos>(EMPTY);
  latest.current = todos;
  const { scheduleDelete } = usePendingDeletes();
  // Ids soft-deleted but still within the undo window: hidden from view, but
  // kept in state + file so a concurrent save doesn't remove them early.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/todos?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((res) => !cancelled && setTodos(res ?? EMPTY))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [project]);

  const persist = useCallback(async () => {
    await fetch(`/api/todos?project=${encodeURIComponent(project)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(latest.current),
    });
  }, [project]);

  // Debounce writes so a burst of toggles becomes one commit.
  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, 1000);
  }, [persist]);

  const mutate = (fn: (t: Todos) => Todos) => {
    setTodos((t) => {
      const next = fn(structuredCloneSafe(t));
      latest.current = next;
      return next;
    });
    scheduleSave();
  };

  const add = (bucket: Bucket) => {
    const text = drafts[bucket].trim();
    if (!text) return;
    // Only week/later carry an explicit due date; today has no picker.
    const due = bucket === "today" ? null : dueDrafts[bucket] || null;
    const todo: Todo = {
      id: newId(),
      text,
      done: false,
      due,
      createdAt: new Date().toISOString(),
    };
    mutate((t) => ({ ...t, [bucket]: [...t[bucket], todo] }));
    setDrafts((d) => ({ ...d, [bucket]: "" }));
    setDueDrafts((d) => ({ ...d, [bucket]: "" }));
  };

  const toggle = (bucket: Bucket, id: string) =>
    mutate((t) => ({
      ...t,
      [bucket]: t[bucket].map((x) =>
        x.id === id ? { ...x, done: !x.done } : x
      ),
    }));

  const remove = (bucket: Bucket, id: string) => {
    const item = latest.current[bucket].find((x) => x.id === id);
    // Hide immediately (view filter), but keep it in state/file for now.
    setPendingIds((p) => new Set(p).add(id));
    scheduleDelete({
      label: `To-do "${item?.text ?? ""}" deleted`,
      // Self-contained so it also works after this component unmounts on nav:
      // re-read the file, drop the id, write it back.
      perform: async () => {
        const cur: Todos = await fetch(
          `/api/todos?project=${encodeURIComponent(project)}`
        ).then((r) => r.json());
        (["today", "week", "later"] as Bucket[]).forEach((b) => {
          cur[b] = (cur[b] ?? []).filter((x) => x.id !== id);
        });
        await fetch(`/api/todos?project=${encodeURIComponent(project)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cur),
        });
        if (mounted.current) {
          setTodos((t) => ({
            ...t,
            [bucket]: t[bucket].filter((x) => x.id !== id),
          }));
          setPendingIds((p) => {
            const n = new Set(p);
            n.delete(id);
            return n;
          });
        }
      },
      onUndo: () =>
        setPendingIds((p) => {
          const n = new Set(p);
          n.delete(id);
          return n;
        }),
    });
  };

  if (loading) return <div className="muted">Loading…</div>;

  return (
    <div className="stack" style={{ gap: compact ? 14 : 22 }}>
      {buckets.map((bucket) => {
        const visible = todos[bucket].filter((t) => !pendingIds.has(t.id));
        return (
        <div key={bucket}>
          <div className="label" style={{ marginBottom: 8 }}>
            {BUCKET_LABEL[bucket]} · {visible.length}
          </div>
          <div>
            {visible.length === 0 && (
              <div className="muted" style={{ fontSize: 14, padding: "4px 0" }}>
                Nothing here yet.
              </div>
            )}
            {visible.map((t) => (
              <div key={t.id} className={`todo ${t.done ? "done" : ""}`}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggle(bucket, t.id)}
                />
                <span className="text">{t.text}</span>
                {t.due && <span className="chip">{t.due}</span>}
                <button
                  className="del"
                  title="Delete"
                  onClick={() => remove(bucket, t.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              type="text"
              placeholder={`Add to ${BUCKET_LABEL[bucket].toLowerCase()}…`}
              value={drafts[bucket]}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [bucket]: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && add(bucket)}
            />
            {bucket === "week" && (
              <input
                type="date"
                title="Due date (within this week)"
                value={dueDrafts.week}
                min={week.start}
                max={week.end}
                onChange={(e) =>
                  setDueDrafts((d) => ({ ...d, week: e.target.value }))
                }
                style={{ width: "auto" }}
              />
            )}
            {bucket === "later" && (
              <input
                type="date"
                title="Due date"
                value={dueDrafts.later}
                onChange={(e) =>
                  setDueDrafts((d) => ({ ...d, later: e.target.value }))
                }
                style={{ width: "auto" }}
              />
            )}
            <button className="btn" onClick={() => add(bucket)}>
              Add
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function structuredCloneSafe<T>(v: T): T {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
}
