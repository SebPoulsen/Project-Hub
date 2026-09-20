"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useHub } from "../providers";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { useScrollLock } from "@/lib/useScrollLock";
import { PlacementPicker } from "@/components/PlacementPicker";
import { PlacementFilter } from "@/components/PlacementFilter";
import {
  placementMatches,
  PLACEMENT_LABEL,
  type PlacementTag,
  type PlacementFilterValue,
} from "@/lib/placement-tag";
import type {
  ResearchQuestion,
  Finding,
  SubGroup,
  SubQuestion,
} from "@/lib/research";

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
  const [newPlace, setNewPlace] = useState<PlacementTag | null>(null);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [editPlace, setEditPlace] = useState<PlacementTag | null>(null);

  // Placement filter for the questions list
  const [placeFilter, setPlaceFilter] = useState<PlacementFilterValue>("all");

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
      body: JSON.stringify({ question, detail: newDetail.trim(), placement: newPlace }),
    });
    setNewQ("");
    setNewDetail("");
    setNewPlace(null);
    setAdding(false);
    load();
  }

  function startEdit(q: ResearchQuestion) {
    setEditId(q.id);
    setEditQ(q.question);
    setEditDetail(q.detail);
    setEditPlace(q.placement ?? null);
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
        body: JSON.stringify({
          question,
          detail: editDetail.trim(),
          placement: editPlace,
        }),
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
            <PlacementPicker value={newPlace} onChange={setNewPlace} />
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
                  setNewPlace(null);
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
        <>
          {questions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <PlacementFilter value={placeFilter} onChange={setPlaceFilter} />
            </div>
          )}
          <div className="stack" style={{ gap: 16 }}>
            {questions
              .filter((q) => placementMatches(q.placement, placeFilter))
              .map((q) => (
                <QuestionCard
                  key={q.id}
                  slug={slug}
                  q={q}
                  findings={findings[q.id] ?? []}
                  findingsMap={findings}
                  reload={load}
                  collapsed={collapsed.has(q.id)}
                  editing={editId === q.id}
                  editQ={editQ}
                  editDetail={editDetail}
                  editPlace={editPlace}
                  setEditQ={setEditQ}
                  setEditDetail={setEditDetail}
                  setEditPlace={setEditPlace}
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
        </>
      )}

      {confirmTarget && (
        <ConfirmDeleteDialog
          question={confirmTarget}
          findingCount={
            // Direct findings PLUS every descendant sub-question's findings,
            // since deleting the question cascades the scrub across its subtree.
            (findings[confirmTarget.id] ?? []).length +
            (confirmTarget.groups ?? []).reduce(
              (n, g) =>
                n +
                g.subQuestions.reduce(
                  (m, s) => m + (findings[s.id]?.length ?? 0),
                  0
                ),
              0
            )
          }
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
  findingsMap,
  reload,
  collapsed,
  editing,
  editQ,
  editDetail,
  setEditQ,
  setEditDetail,
  editPlace,
  setEditPlace,
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
  findingsMap: Record<string, Finding[]>;
  reload: () => void;
  collapsed: boolean;
  editing: boolean;
  editQ: string;
  editDetail: string;
  editPlace: PlacementTag | null;
  setEditQ: (s: string) => void;
  setEditDetail: (s: string) => void;
  setEditPlace: (p: PlacementTag | null) => void;
  onToggleCollapse: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onFindingAdded: () => void;
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  // The quick-add panel does double duty: log a finding, or add a sub-question
  // (optionally into a brand-new group) without leaving the Research page.
  const [quickMode, setQuickMode] = useState<"finding" | "subquestion">(
    "finding"
  );
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBody, setQuickBody] = useState("");
  const [subGroupId, setSubGroupId] = useState<string>(
    () => q.groups[0]?.id ?? "__new__"
  );
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [subText, setSubText] = useState("");
  const [busy, setBusy] = useState(false);

  function closeQuick() {
    setQuickOpen(false);
    setQuickTitle("");
    setQuickBody("");
    setSubText("");
    setNewGroupTitle("");
    setQuickMode("finding");
  }

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
    closeQuick();
    onFindingAdded();
  }

  async function saveQuickSubQuestion() {
    const question = subText.trim();
    if (!question) return;
    const makingNewGroup = subGroupId === "__new__" || q.groups.length === 0;
    if (makingNewGroup && !newGroupTitle.trim()) return;
    setBusy(true);
    const api = `/api/research?project=${encodeURIComponent(slug)}`;
    // Create the group first when needed, then the sub-question inside it.
    let groupId = subGroupId;
    if (makingNewGroup) {
      const g = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "group",
          rqId: q.id,
          title: newGroupTitle.trim(),
        }),
      }).then((r) => r.json());
      groupId = g?.id;
    }
    if (groupId) {
      await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subquestion",
          rqId: q.id,
          groupId,
          question,
        }),
      });
    }
    setBusy(false);
    closeQuick();
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
          <PlacementPicker value={editPlace} onChange={setEditPlace} />
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
        {q.placement && (
          <span className="chip chip-placement">{PLACEMENT_LABEL[q.placement]}</span>
        )}
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
          <div className="seg">
            <button
              type="button"
              className={`seg-btn ${quickMode === "finding" ? "on" : ""}`}
              onClick={() => setQuickMode("finding")}
            >
              Finding
            </button>
            <button
              type="button"
              className={`seg-btn ${quickMode === "subquestion" ? "on" : ""}`}
              onClick={() => setQuickMode("subquestion")}
            >
              Sub-question
            </button>
          </div>

          {quickMode === "finding" ? (
            <>
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
                <button className="btn btn-ghost" onClick={closeQuick}>
                  Cancel
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Saved as a note tagged to this question.
              </div>
            </>
          ) : (
            <>
              {q.groups.length > 0 && (
                <select
                  value={subGroupId}
                  onChange={(e) => setSubGroupId(e.target.value)}
                >
                  {q.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                  <option value="__new__">+ New group…</option>
                </select>
              )}
              {(subGroupId === "__new__" || q.groups.length === 0) && (
                <input
                  type="text"
                  placeholder="New group title (e.g. Pricing psychology)"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                />
              )}
              <input
                type="text"
                placeholder="Sub-question text"
                value={subText}
                onChange={(e) => setSubText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveQuickSubQuestion()}
              />
              <div className="row">
                <button
                  className="btn btn-accent"
                  onClick={saveQuickSubQuestion}
                  disabled={busy}
                >
                  {busy ? "Adding…" : "Add sub-question"}
                </button>
                <button className="btn btn-ghost" onClick={closeQuick}>
                  Cancel
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Adds a sub-question under this question
                {subGroupId === "__new__" || q.groups.length === 0
                  ? ", in a new group."
                  : "."}
              </div>
            </>
          )}
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

          <SubQuestionsRegion
            slug={slug}
            q={q}
            findingsMap={findingsMap}
            reload={reload}
          />
        </div>
      )}
    </div>
  );
}

/** Sum of live findings across every sub-question in a group. */
function groupFindingCount(
  g: SubGroup,
  findingsMap: Record<string, Finding[]>
): number {
  return g.subQuestions.reduce(
    (n, s) => n + (findingsMap[s.id]?.length ?? 0),
    0
  );
}

/**
 * The nested-disclosure region on an overarching question card: its titled
 * sub-question groups. Expanded by default (the point of the feature); each
 * group inside is collapsed by default. Owns add-group + region-toggle state.
 */
function SubQuestionsRegion({
  slug,
  q,
  findingsMap,
  reload,
}: {
  slug: string;
  q: ResearchQuestion;
  findingsMap: Record<string, Finding[]>;
  reload: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function addGroup() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    await fetch(`/api/research?project=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "group", rqId: q.id, title: t }),
    });
    setBusy(false);
    setTitle("");
    setAdding(false);
    reload();
  }

  const groups = q.groups ?? [];

  return (
    <div className="rq-subregion">
      <div className="row between" style={{ alignItems: "center" }}>
        <button
          className="rq-subhead"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className={`chev ${open ? "open" : ""}`}>›</span>
          <span className="rq-subhead-label">
            Sub-questions
            {groups.length > 0 && (
              <span className="muted"> · {groups.length}</span>
            )}
          </span>
        </button>
        {open && !adding && (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>
            + Group
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {adding && (
            <div className="stack" style={{ marginBottom: 12 }}>
              <input
                type="text"
                autoFocus
                placeholder="Group title (e.g. Pricing psychology)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGroup()}
              />
              <div className="row">
                <button
                  className="btn btn-accent"
                  onClick={addGroup}
                  disabled={busy}
                >
                  {busy ? "Adding…" : "Add group"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setAdding(false);
                    setTitle("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {groups.length === 0 ? (
            !adding && (
              <div className="tempty">
                No sub-question groups yet. Add a group to cluster finer
                questions under this one.
              </div>
            )
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {groups.map((g) => (
                <GroupBlock
                  key={g.id}
                  slug={slug}
                  rqId={q.id}
                  group={g}
                  findingsMap={findingsMap}
                  reload={reload}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One titled group: collapsed by default, revealing its sub-questions and their
 * findings. Full rename/delete on itself and add/edit/delete on its
 * sub-questions, each via the shared soft-delete+undo pattern.
 */
function GroupBlock({
  slug,
  rqId,
  group,
  findingsMap,
  reload,
}: {
  slug: string;
  rqId: string;
  group: SubGroup;
  findingsMap: Record<string, Finding[]>;
  reload: () => void;
}) {
  const { scheduleDelete } = usePendingDeletes();
  const [open, setOpen] = useState(false); // groups collapsed by default
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [addingSub, setAddingSub] = useState(false);
  const [subText, setSubText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false); // optimistic hide during undo window

  async function saveTitle() {
    const t = title.trim();
    if (!t) return;
    await fetch(`/api/research?project=${encodeURIComponent(slug)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "group", rqId, groupId: group.id, title: t }),
    });
    setEditing(false);
    reload();
  }

  async function addSub() {
    const question = subText.trim();
    if (!question) return;
    setBusy(true);
    await fetch(`/api/research?project=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "subquestion",
        rqId,
        groupId: group.id,
        question,
      }),
    });
    setBusy(false);
    setSubText("");
    setAddingSub(false);
    reload();
  }

  function removeGroup() {
    // Hide immediately (own UI); the real delete + ref-scrub runs at finalize.
    setHidden(true);
    scheduleDelete({
      label: `Group "${group.title}" deleted`,
      perform: async () => {
        await fetch(
          `/api/research?project=${encodeURIComponent(slug)}&type=group&rqId=${encodeURIComponent(rqId)}&groupId=${encodeURIComponent(group.id)}`,
          { method: "DELETE" }
        );
      },
      onUndo: () => setHidden(false),
    });
  }

  const count = groupFindingCount(group, findingsMap);

  if (hidden) return null;

  if (editing) {
    return (
      <div className="rq-group">
        <div className="stack">
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
          />
          <div className="row">
            <button className="btn btn-accent" onClick={saveTitle}>
              Save
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setEditing(false);
                setTitle(group.title);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rq-group">
      <div className="rq-group-head">
        <button
          className="rq-subhead"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className={`chev ${open ? "open" : ""}`}>›</span>
          <span className="rq-group-title">{group.title}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            · {group.subQuestions.length}
          </span>
        </button>
        {open ? (
          <div className="rq-rowactions">
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setAddingSub((o) => !o)}
            >
              + Sub-question
            </button>
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setEditing(true)}
            >
              Rename
            </button>
            <QuietDelete onClick={removeGroup} label="Delete group" />
          </div>
        ) : (
          <span className="tsection-count">{count}</span>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="rq-sub-meta" style={{ marginBottom: 10 }}>
            {count} {count === 1 ? "finding" : "findings"} across{" "}
            {group.subQuestions.length}{" "}
            {group.subQuestions.length === 1 ? "sub-question" : "sub-questions"}
          </div>

          {addingSub && (
            <div className="stack" style={{ marginBottom: 12 }}>
              <input
                type="text"
                autoFocus
                placeholder="Sub-question text"
                value={subText}
                onChange={(e) => setSubText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSub()}
              />
              <div className="row">
                <button
                  className="btn btn-accent"
                  onClick={addSub}
                  disabled={busy}
                >
                  {busy ? "Adding…" : "Add sub-question"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setAddingSub(false);
                    setSubText("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {group.subQuestions.length === 0 ? (
            !addingSub && (
              <div className="tempty">No sub-questions in this group yet.</div>
            )
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {group.subQuestions.map((s) => (
                <SubQuestionRow
                  key={s.id}
                  slug={slug}
                  rqId={rqId}
                  groupId={group.id}
                  sub={s}
                  findings={findingsMap[s.id] ?? []}
                  reload={reload}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One sub-question: its header, quiet row actions, and its nested findings. */
function SubQuestionRow({
  slug,
  rqId,
  groupId,
  sub,
  findings,
  reload,
}: {
  slug: string;
  rqId: string;
  groupId: string;
  sub: SubQuestion;
  findings: Finding[];
  reload: () => void;
}) {
  const { scheduleDelete } = usePendingDeletes();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(sub.question);
  const [hidden, setHidden] = useState(false); // optimistic hide during undo window

  // Inline "+ Finding" quick-add (same as overarching questions), tagged to
  // this sub-question so it lands in the sub-question's own bucket.
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBody, setQuickBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const question = text.trim();
    if (!question) return;
    await fetch(`/api/research?project=${encodeURIComponent(slug)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "subquestion",
        rqId,
        groupId,
        subId: sub.id,
        question,
      }),
    });
    setEditing(false);
    reload();
  }

  async function saveQuickFinding() {
    const body = quickBody.trim();
    if (!body) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("title", quickTitle.trim() || `Finding · ${sub.question}`);
    fd.append("body", body);
    fd.append("tags", "");
    fd.append("research", sub.id);
    await fetch(`/api/notes?project=${encodeURIComponent(slug)}`, {
      method: "POST",
      body: fd,
    });
    setBusy(false);
    setQuickTitle("");
    setQuickBody("");
    setQuickOpen(false);
    reload();
  }

  function remove() {
    // Hide immediately (own UI); the real delete + ref-scrub runs at finalize.
    setHidden(true);
    scheduleDelete({
      label: `Sub-question "${sub.question}" deleted`,
      perform: async () => {
        await fetch(
          `/api/research?project=${encodeURIComponent(slug)}&type=subquestion&rqId=${encodeURIComponent(rqId)}&groupId=${encodeURIComponent(groupId)}&subId=${encodeURIComponent(sub.id)}`,
          { method: "DELETE" }
        );
      },
      onUndo: () => setHidden(false),
    });
  }

  if (hidden) return null;

  if (editing) {
    return (
      <div className="rq-sub">
        <div className="stack">
          <input
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <div className="row">
            <button className="btn btn-accent" onClick={save}>
              Save
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setEditing(false);
                setText(sub.question);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rq-sub">
      <div className="rq-sub-head">
        <span className="rq-sub-title">{sub.question}</span>
        <div className="rq-rowactions">
          <button
            className="btn btn-ghost btn-mini"
            onClick={() => setQuickOpen((o) => !o)}
          >
            + Finding
          </button>
          <button
            className="btn btn-ghost btn-mini"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <QuietDelete onClick={remove} label="Delete sub-question" />
        </div>
      </div>

      <div className="rq-sub-meta">
        {findings.length === 0
          ? "No findings yet"
          : `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}
      </div>

      {quickOpen && (
        <div className="stack" style={{ marginTop: 10 }}>
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
            style={{ minHeight: 70 }}
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
            Saved as a note tagged to this sub-question.
          </div>
        </div>
      )}

      {findings.length > 0 && (
        <div className="rq-sub-findings">
          {findings.map((f) => (
            <FindingRow key={`${f.kind}-${f.ref}`} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Quiet, secondary delete affordance — icon-only and muted so it reads as a
 * low-emphasis action and isn't hit by accident while scanning. Turns danger-
 * colored only on hover/focus. The soft-delete+undo still lives behind it.
 */
function QuietDelete({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="rq-iconbtn rq-del"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
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
