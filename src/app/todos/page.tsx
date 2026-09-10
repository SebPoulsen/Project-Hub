"use client";

import { useHub } from "../providers";
import { TodoList } from "@/components/TodoList";

export default function TodosPage() {
  const { current, loading } = useHub();
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
        <h1>To-dos</h1>
      </div>
      <div className="card">
        <TodoList project={current.slug} />
      </div>
    </div>
  );
}
