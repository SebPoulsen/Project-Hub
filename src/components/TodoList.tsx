"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Todos>(EMPTY);
  latest.current = todos;

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
    const todo: Todo = {
      id: newId(),
      text,
      done: false,
      due: null,
      createdAt: new Date().toISOString(),
    };
    mutate((t) => ({ ...t, [bucket]: [...t[bucket], todo] }));
    setDrafts((d) => ({ ...d, [bucket]: "" }));
  };

  const toggle = (bucket: Bucket, id: string) =>
    mutate((t) => ({
      ...t,
      [bucket]: t[bucket].map((x) =>
        x.id === id ? { ...x, done: !x.done } : x
      ),
    }));

  const remove = (bucket: Bucket, id: string) =>
    mutate((t) => ({ ...t, [bucket]: t[bucket].filter((x) => x.id !== id) }));

  if (loading) return <div className="muted">Loading…</div>;

  return (
    <div className="stack" style={{ gap: compact ? 14 : 22 }}>
      {buckets.map((bucket) => (
        <div key={bucket}>
          <div className="label" style={{ marginBottom: 8 }}>
            {BUCKET_LABEL[bucket]} · {todos[bucket].length}
          </div>
          <div>
            {todos[bucket].length === 0 && (
              <div className="muted" style={{ fontSize: 14, padding: "4px 0" }}>
                Nothing here yet.
              </div>
            )}
            {todos[bucket].map((t) => (
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
            <button className="btn" onClick={() => add(bucket)}>
              Add
            </button>
          </div>
        </div>
      ))}
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
