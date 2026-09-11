"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useHub } from "../providers";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { useScrollLock } from "@/lib/useScrollLock";
import type { ResearchQuestion, Finding } from "@/lib/research";

export default function ResearchPage() {
  const { current, loading } = useHub();
  const { scheduleDelete } = usePendingDeletes();

  const [questions, setQuestions] = useState<ResearchQuestion[]>([]);
  const [findings, setFindings] = useState<Record<string, Finding[]>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Add-question form
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [newDetail, setNewDetail] = useState("");

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState("");
  const [editDetail, setEditDetail] = useState("");

  // Delete confirmation (one tier more caution than notes/reflections/todos,
  // since a research delete cascades — it scrubs refs out of tagged entries).
  const [confirmTarget, setConfirmTarget] = useState<ResearchQuestion | null>(
    null
  );

  const load = useCallback(async () => {
    if (!current) return;
    const res = await fetch(
      `/api/research?project=${encodeURIComponent(current.slug)}`
    ).then((r) => r.json());
    setQuestions(res?.items ?? []);
    setFindings(res?.findings ?? {});
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return (
      <div className="empty-state">
        <h2>No project selected</h2>
        <p>Create or pick a project first.</p>
      </div>
    );

  const slug = current.slug;

  async function addQuestion() {
    const question = newQ.trim();
    if (!question) return;
    await fetch(`/api/research?project=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, detail: newDetail.trim() }),
    });
    setNewQ("");
    setNewDetail("");
    setAdding(false);
    load();
  }

  function startEdit(q: ResearchQuestion) {
    setEditId(q.id);
    setEditQ(q.question);
    setEditDetail(q.detail);
  }

  async function saveEdit() {
    if (!editId) return;
    const question = editQ.trim();
    if (!question) return;
    await fetch(
      `/api/research?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(editId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, detail: editDetail.trim() }),
      }
    );
    setEditId(null);
    load();
  }

  async function toggleStatus(q: ResearchQuestion) {
    const status = q.status === "answered" ? "open" : "answered";
    // Optimistic: reflect immediately, then persist.
    setQuestions((qs) =>
      qs.map((x) => (x.id === q.id ? { ...x, status } : x))
    );
    await fetch(
      `/api/research?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(q.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
  }

  function remove(q: ResearchQuestion) {
    // Hide immediately; real delete + commit only after the undo window closes.
    setQuestions((qs) => qs.filter((x) => x.id !== q.id));
    if (editId === q.id) setEditId(null);
    scheduleDelete({
      label: `Question "${q.question}" deleted`,
      perform: async () => {
        await fetch(
          `/api/research?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(q.id)}`,
          { method: "DELETE" }
        );
      },
      onUndo: () => load(),
    });
  }

  function toggleCollapse(id: string) {
    setCollapsed((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="page-head">
        <div className="row between">
          <div>
            <div className="label">{current.name}</div>
            <h1>Research</h1>
          </div>
          {!adding && (
            <button className="btn btn-accent" onClick={() => setAdding(true)}>
              + New question
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            New research question
          </div>
          <div className="stack">
            <input
              type="text"
              autoFocus
              placeholder="What do you want to find out?"
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addQuestion()}
            />
            <textarea
              placeholder="Optional context or why this matters…"
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
              style={{ minHeight: 70 }}
            />
            <div className="row">
              <button className="btn btn-accent" onClick={addQuestion}>
                Add question
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setAdding(false);
                  setNewQ("");
                  setNewDetail("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {questions.length === 0 && !adding ? (
        <div className="empty-state">
          <h2>No research questions yet</h2>
          <p>
            Add a question, then tag reflections and notes to it — they’ll gather
            here as findings.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              slug={slug}
              q={q}
              findings={findings[q.id] ?? []}
              collapsed={collapsed.has(q.id)}
              editing={editId === q.id}
              editQ={editQ}
              editDetail={editDetail}
              setEditQ={setEditQ}
              setEditDetail={setEditDetail}
              onToggleCollapse={() => toggleCollapse(q.id)}
              onStartEdit={() => startEdit(q)}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditId(null)}
              onToggleStatus={() => toggleStatus(q)}
              onDelete={() => setConfirmTarget(q)}
              onFindingAdded={load}
            />
          ))}
        </div>
      )}

      {confirmTarget && (
        <ConfirmDeleteDialog
          question={confirmTarget}
          findingCount={(findings[confirmTarget.id] ?? []).length}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => {
            remove(confirmTarget);
            setConfirmTarget(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmDeleteDialog({
  question,
  findingCount,
  onCancel,
  onConfirm,
}: {
  question: ResearchQuestion;
  findingCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 10px" }}>Delete this question?</h3>
        <p style={{ margin: "0 0 6px", lineHeight: 1.5 }}>
          “{question.question}”
        </p>
        <p className="muted" style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.5 }}>
          {findingCount > 0
            ? `This removes the question and untags it from ${findingCount} ${
                findingCount === 1 ? "entry" : "entries"
              } (the notes/reflections themselves are kept). `
            : "This removes the question. "}
          You can undo for a few seconds after.
        </p>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-accent danger" onClick={onConfirm}>
            Delete question
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  slug,
  q,
  findings,
  collapsed,
  editing,
  editQ,
  editDetail,
  setEditQ,
  setEditDetail,
  onToggleCollapse,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleStatus,
  onDelete,
  onFindingAdded,
}: {
  slug: string;
  q: ResearchQuestion;
  findings: Finding[];
  collapsed: boolean;
  editing: boolean;
  editQ: string;
  editDetail: string;
  setEditQ: (s: string) => void;
  setEditDetail: (s: string) => void;
  onToggleCollapse: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onFindingAdded: () => void;
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBody, setQuickBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveQuickFinding() {
    const body = quickBody.trim();
    if (!body) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("title", quickTitle.trim() || `Finding · ${q.question}`);
    fd.append("body", body);
    fd.append("tags", "");
    fd.append("research", q.id);
    await fetch(`/api/notes?project=${encodeURIComponent(slug)}`, {
      method: "POST",
      body: fd,
    });
    setBusy(false);
    setQuickTitle("");
    setQuickBody("");
    setQuickOpen(false);
    onFindingAdded();
  }

  if (editing) {
    return (
      <div className="card">
        <div className="stack">
          <input
            type="text"
            value={editQ}
            onChange={(e) => setEditQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSaveEdit()}
          />
          <textarea
            placeholder="Optional context…"
            value={editDetail}
            onChange={(e) => setEditDetail(e.target.value)}
            style={{ minHeight: 70 }}
          />
          <div className="row">
            <button className="btn btn-accent" onClick={onSaveEdit}>
              Save
            </button>
            <button className="btn btn-ghost" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <button
          className="rq-head"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
        >
          <span className={`chev ${!collapsed ? "open" : ""}`}>›</span>
          <span className="rq-title serif">{q.question}</span>
        </button>
        <span className="tsection-count">{findings.length}</span>
      </div>

      {q.detail && (
        <p className="muted" style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
          {q.detail}
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span className={`chip ${q.status === "answered" ? "chip-done" : ""}`}>
          {q.status === "answered" ? "Answered" : "Open"}
        </span>
        <button className="btn btn-ghost" onClick={onToggleStatus}>
          {q.status === "answered" ? "Reopen" : "Mark answered"}
        </button>
        <button className="btn btn-ghost" onClick={() => setQuickOpen((o) => !o)}>
          + Finding
        </button>
        <button className="btn btn-ghost" onClick={onStartEdit}>
          Edit
        </button>
        <button className="btn btn-ghost danger" onClick={onDelete}>
          Delete
        </button>
      </div>

      {quickOpen && (
        <div className="stack" style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="Finding title (optional)"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
          />
          <textarea
            placeholder="What did you learn?"
            value={quickBody}
            onChange={(e) => setQuickBody(e.target.value)}
            style={{ minHeight: 80 }}
          />
          <div className="row">
            <button
              className="btn btn-accent"
              onClick={saveQuickFinding}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save finding"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setQuickOpen(false);
                setQuickTitle("");
                setQuickBody("");
              }}
            >
              Cancel
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Saved as a note tagged to this question.
          </div>
        </div>
      )}

      {!collapsed && (
        <div style={{ marginTop: 14 }}>
          {findings.length === 0 ? (
            <div className="tempty">
              No findings yet. Tag a reflection or note to this question, or add
              a finding above.
            </div>
          ) : (
            <div className="stack" style={{ gap: 0 }}>
              {findings.map((f) => (
                <FindingRow key={`${f.kind}-${f.ref}`} f={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const href =
    f.kind === "reflection"
      ? `/reflections?date=${encodeURIComponent(f.ref)}`
      : `/notes?id=${encodeURIComponent(f.ref)}`;
  return (
    <div className="rq-finding">
      <div className="row between">
        <span className="rq-finding-title">{f.title}</span>
        <span className="rq-finding-kind">{f.kind}</span>
      </div>
      {f.snippet && <p className="rq-finding-snippet">{f.snippet}</p>}
      <Link href={href} className="link-accent" style={{ fontSize: 13 }}>
        Open {f.kind} →
      </Link>
    </div>
  );
}
