"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePendingDeletes } from "@/components/PendingDeletes";
import {
  bucketize,
  dueLabel,
  ymd,
  BUCKET_LABEL,
  type Bucket,
} from "@/lib/todo-buckets";
import type { Todo, TodosFile } from "@/lib/todos";

function newId() {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function TodoList({
  project,
  showAdd = true,
  only,
}: {
  project: string;
  /** Show the single add bar. */
  showAdd?: boolean;
  /** Render only this computed bucket, headerless (dashboard glance mode). */
  only?: Bucket;
}) {
  const [items, setItems] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  // The add-date defaults to today and resets to today on mount — i.e. whenever
  // you navigate into To-dos or reload (same derive-fresh idea as the reflection
  // date fix), never persisting a stale hand-picked date.
  const [dueDraft, setDueDraft] = useState(() => ymd(new Date()));
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Bucketing is a load-time computation (not a live poller), so capture "now"
  // once per mount. Re-mounting on navigation re-buckets everything.
  const [now] = useState(() => new Date());

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Todo[]>([]);
  latest.current = items;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { scheduleDelete } = usePendingDeletes();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/todos?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((res: TodosFile) => !cancelled && setItems(res?.items ?? []))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [project]);

  const persist = useCallback(async () => {
    await fetch(`/api/todos?project=${encodeURIComponent(project)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: latest.current }),
    });
  }, [project]);

  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, 1000);
  }, [persist]);

  const mutate = (fn: (items: Todo[]) => Todo[]) => {
    setItems((cur) => {
      const next = fn(cur);
      latest.current = next;
      return next;
    });
    scheduleSave();
  };

  const add = () => {
    const t = text.trim();
    if (!t) return;
    const todo: Todo = {
      id: newId(),
      text: t,
      done: false,
      due: dueDraft || null, // cleared date => Later
      createdAt: new Date().toISOString(),
    };
    mutate((cur) => [...cur, todo]);
    setText("");
    setDueDraft(ymd(new Date())); // reset to today for the next add
  };

  const toggle = (id: string) =>
    mutate((cur) =>
      cur.map((x) => (x.id === id ? { ...x, done: !x.done } : x))
    );

  const remove = (id: string) => {
    const item = latest.current.find((x) => x.id === id);
    setPendingIds((p) => new Set(p).add(id)); // hide immediately
    scheduleDelete({
      label: `To-do "${item?.text ?? ""}" deleted`,
      // Self-contained (survives unmount on navigation): re-read, drop, write.
      perform: async () => {
        const cur: TodosFile = await fetch(
          `/api/todos?project=${encodeURIComponent(project)}`
        ).then((r) => r.json());
        const next = (cur.items ?? []).filter((x) => x.id !== id);
        await fetch(`/api/todos?project=${encodeURIComponent(project)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: next }),
        });
        if (mounted.current) {
          setItems((cur2) => cur2.filter((x) => x.id !== id));
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

  const visible = items.filter((t) => !pendingIds.has(t.id));
  const buckets = bucketize(visible, now);

  const renderItem = (t: Todo) => {
    const label = dueLabel(t.due, now);
    return (
      <div key={t.id} className={`titem ${t.done ? "done" : ""}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={t.done}
          aria-label={t.done ? "Mark not done" : "Mark done"}
          className="tcheck"
          data-done={t.done}
          onClick={() => toggle(t.id)}
        >
          {t.done ? "✓" : ""}
        </button>
        <span className="titem-text">{t.text}</span>
        {label && <span className={`due-chip due-${label.tone}`}>{label.text}</span>}
        <button
          type="button"
          className="titem-del"
          title="Delete"
          aria-label="Delete task"
          onClick={() => remove(t.id)}
        >
          ×
        </button>
      </div>
    );
  };

  // Dashboard glance mode: a single computed bucket, no header, no add bar.
  if (only) {
    const list = buckets[only];
    if (list.length === 0)
      return <div className="muted" style={{ fontSize: 14 }}>Nothing due today.</div>;
    return <div className="tsection-body">{list.map(renderItem)}</div>;
  }

  const Section = ({
    bucket,
    always,
  }: {
    bucket: Bucket;
    always?: boolean;
  }) => {
    const list = buckets[bucket];
    if (list.length === 0 && !always) return null;
    return (
      <div className={`tsection tsection-${bucket}`}>
        <div className="tsection-head">
          <span className="tsection-title">{BUCKET_LABEL[bucket]}</span>
          <span className="tsection-count">{list.length}</span>
        </div>
        <div className="tsection-body">
          {list.length === 0 ? (
            <div className="tempty">Nothing due — clear for now.</div>
          ) : (
            list.map(renderItem)
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="todo-app">
      {showAdd && (
        <form
          className="todo-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            type="text"
            className="todo-add-text"
            placeholder="Add a task…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <input
            type="date"
            className="todo-add-date"
            title="Due date (clear for “Later”)"
            value={dueDraft}
            onChange={(e) => setDueDraft(e.target.value)}
          />
          <button type="submit" className="btn btn-accent">
            Add
          </button>
        </form>
      )}

      <Section bucket="today" always />
      <Section bucket="week" />
      <Section bucket="later" />
    </div>
  );
}
