"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { PlacementPicker } from "@/components/PlacementPicker";
import { PlacementFilter } from "@/components/PlacementFilter";
import {
  placementMatches,
  PLACEMENT_LABEL,
  type PlacementTag,
  type PlacementFilterValue,
} from "@/lib/placement-tag";
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

const CalendarIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export function TodoList({
  project,
  showAdd = true,
  only,
}: {
  project: string;
  /** Show the single add bar. */
  showAdd?: boolean;
  /** Render only these computed buckets, headerless (dashboard glance mode). */
  only?: Bucket[];
}) {
  const [items, setItems] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [dueDraft, setDueDraft] = useState(() => ymd(new Date()));
  const [placeDraft, setPlaceDraft] = useState<PlacementTag | null>(null);
  const [placeFilter, setPlaceFilter] = useState<PlacementFilterValue>("all");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [now] = useState(() => new Date());

  // Inline edit + quick-reschedule state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editPlace, setEditPlace] = useState<PlacementTag | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  // Draft for the quick-reschedule picker so typing a date doesn't commit (and
  // close) on every keystroke — we commit only on Enter / blur / calendar pick.
  const [rescheduleDraft, setRescheduleDraft] = useState("");

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

  // Single update path used by add-edit and quick-reschedule alike. Changing
  // `due` re-buckets automatically (buckets are computed on render).
  const updateTodo = (id: string, patch: Partial<Todo>) =>
    mutate((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const add = () => {
    const t = text.trim();
    if (!t) return;
    const todo: Todo = {
      id: newId(),
      text: t,
      done: false,
      due: dueDraft || null,
      createdAt: new Date().toISOString(),
      ...(placeDraft ? { placement: placeDraft } : {}),
    };
    mutate((cur) => [...cur, todo]);
    setText("");
    setDueDraft(ymd(new Date()));
    setPlaceDraft(null);
  };

  const toggle = (id: string) =>
    mutate((cur) =>
      cur.map((x) => (x.id === id ? { ...x, done: !x.done } : x))
    );

  const startEdit = (t: Todo) => {
    setReschedulingId(null);
    setEditingId(t.id);
    setEditText(t.text);
    setEditDue(t.due ?? "");
    setEditPlace(t.placement ?? null);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (id: string) => {
    const t = editText.trim();
    updateTodo(id, {
      text: t || "Untitled task",
      due: editDue || null,
      placement: editPlace ?? undefined,
    });
    setEditingId(null);
  };

  const openReschedule = (t: Todo) => {
    setEditingId(null);
    setRescheduleDraft(t.due ?? ymd(now));
    setReschedulingId(t.id);
  };
  // Commit the draft (only when it actually changed) and close. Called on a
  // deliberate action — Enter, blur, or picking from the calendar.
  const commitReschedule = (t: Todo) => {
    const next = rescheduleDraft || null;
    if (next !== (t.due ?? null)) updateTodo(t.id, { due: next });
    setReschedulingId(null);
  };

  const remove = (id: string) => {
    const item = latest.current.find((x) => x.id === id);
    setPendingIds((p) => new Set(p).add(id));
    scheduleDelete({
      label: `To-do "${item?.text ?? ""}" deleted`,
      perform: async () => {
        // One atomic, id-scoped delete — the server removes just this item under
        // a per-project lock. No read-modify-write of the whole list (which
        // raced when several finalized at once), and `keepalive` lets the
        // request finish even if the page is navigating away or reloading.
        await fetch(
          `/api/todos?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`,
          { method: "DELETE", keepalive: true }
        );
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

  const visible = items.filter(
    (t) => !pendingIds.has(t.id) && placementMatches(t.placement, placeFilter)
  );
  const buckets = bucketize(visible, now);

  const renderItem = (t: Todo) => {
    // Inline edit form (text + due), replaces the row.
    if (editingId === t.id) {
      return (
        <div
          key={t.id}
          className="titem titem-editing"
          style={{ flexWrap: "wrap", rowGap: 8 }}
        >
          <input
            type="text"
            className="tedit-text"
            value={editText}
            autoFocus
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit(t.id);
              if (e.key === "Escape") cancelEdit();
            }}
          />
          <input
            type="date"
            className="tedit-date"
            title="Due date (clear for “Later”)"
            value={editDue}
            onChange={(e) => setEditDue(e.target.value)}
          />
          <button className="btn btn-accent" onClick={() => saveEdit(t.id)}>
            Save
          </button>
          <button className="btn btn-ghost" onClick={cancelEdit}>
            Cancel
          </button>
          <div style={{ flexBasis: "100%" }}>
            <PlacementPicker value={editPlace} onChange={setEditPlace} />
          </div>
        </div>
      );
    }

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
        {t.placement && (
          <span className="chip chip-placement">{PLACEMENT_LABEL[t.placement]}</span>
        )}
        {label && <span className={`due-chip due-${label.tone}`}>{label.text}</span>}

        {reschedulingId === t.id ? (
          <input
            type="date"
            className="titem-reschedule"
            autoFocus
            value={rescheduleDraft}
            onChange={(e) => setRescheduleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitReschedule(t);
              if (e.key === "Escape") setReschedulingId(null);
            }}
            onBlur={() => commitReschedule(t)}
          />
        ) : (
          <div className="titem-actions">
            <button
              type="button"
              className="titem-act"
              title="Reschedule"
              aria-label="Reschedule"
              onClick={() => openReschedule(t)}
            >
              <CalendarIcon />
            </button>
            <button
              type="button"
              className="titem-act"
              title="Edit"
              aria-label="Edit task"
              onClick={() => startEdit(t)}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              className="titem-act titem-del"
              title="Delete"
              aria-label="Delete task"
              onClick={() => remove(t.id)}
            >
              ×
            </button>
          </div>
        )}
      </div>
    );
  };

  // Dashboard glance mode: the given computed buckets, concatenated, no headers.
  if (only) {
    const list = only.flatMap((b) => buckets[b]);
    if (list.length === 0)
      return <div className="muted" style={{ fontSize: 14 }}>Nothing due today.</div>;
    return <div className="tsection-body">{list.map(renderItem)}</div>;
  }

  // A plain function that RETURNS JSX (called inline below), not a component
  // used as <Section/>. This matters: an inline-defined component gets a new
  // identity every render and would remount its whole subtree each keystroke,
  // thrashing focus in the edit/reschedule inputs.
  const renderSection = (bucket: Bucket, always = false) => {
    const list = buckets[bucket];
    if (list.length === 0 && !always) return null;
    return (
      <div key={bucket} className={`tsection tsection-${bucket}`}>
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
        <div style={{ marginBottom: 16 }}>
          <form
            className="todo-add"
            style={{ marginBottom: 8 }}
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
          <PlacementPicker value={placeDraft} onChange={setPlaceDraft} />
        </div>
      )}

      {showAdd && items.some((t) => !pendingIds.has(t.id)) && (
        <div style={{ marginBottom: 14 }}>
          <PlacementFilter value={placeFilter} onChange={setPlaceFilter} />
        </div>
      )}

      {renderSection("overdue")}
      {renderSection("today", true)}
      {renderSection("week")}
      {renderSection("later")}
    </div>
  );
}
