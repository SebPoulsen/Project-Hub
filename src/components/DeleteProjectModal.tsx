"use client";

import { useState } from "react";
import { useHub } from "@/app/providers";
import { useScrollLock } from "@/lib/useScrollLock";
import type { Project } from "@/lib/projects";

/**
 * Destructive project delete. Because this permanently removes real
 * reflection/note/todo data, the delete button stays disabled until the user
 * types the project's exact name (GitHub repo-delete pattern) — more friction
 * than a yes/no confirm.
 */
export function DeleteProjectModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const { deleteProject } = useHub();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  useScrollLock();

  // Exact, case-sensitive match against the real stored name — no trimming or
  // case normalization on either side.
  const armed = confirmText === project.name && !busy;

  async function handleDelete() {
    if (!armed) return;
    setBusy(true);
    await deleteProject(project.slug);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 10px" }}>Delete project</h3>
        <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 0 }}>
          This permanently deletes <strong>{project.name}</strong> and{" "}
          <strong>all</strong> its reflections, notes, to-dos, and attachments.
          This cannot be undone.
        </p>
        <div className="label" style={{ marginBottom: 6 }}>
          Type the project name to confirm
        </div>
        {/* The name is shown OUTSIDE the .label (which uppercases) and with an
            explicit text-transform:none, so the displayed text is the exact
            stored name the match checks against — case and all. */}
        <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 8px" }}>
          Enter{" "}
          <strong
            style={{
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
              textTransform: "none",
            }}
          >
            {project.name}
          </strong>{" "}
          exactly, including capitalization.
        </p>
        <input
          type="text"
          value={confirmText}
          autoFocus
          placeholder={project.name}
          onChange={(e) => setConfirmText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleDelete()}
        />
        <div className="row between" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            disabled={!armed}
            style={{
              borderColor: armed ? "var(--danger)" : "var(--border)",
              opacity: armed ? 1 : 0.55,
              cursor: armed ? "pointer" : "not-allowed",
            }}
            onClick={handleDelete}
          >
            {busy ? "Deleting…" : "Delete this project"}
          </button>
        </div>
      </div>
    </div>
  );
}
