"use client";

import { useState } from "react";
import { useHub } from "../providers";
import { IndividualEval } from "@/components/IndividualEval";
import { ProjectEvalForm } from "@/components/ProjectEvalForm";

type Track = "individual" | "project";

export default function EvaluationsPage() {
  const { current, loading } = useHub();
  const [track, setTrack] = useState<Track>("individual");

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
        <h1>Evaluations</h1>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 20 }}>
        <button
          className={`btn ${track === "individual" ? "btn-accent" : "btn-ghost"}`}
          onClick={() => setTrack("individual")}
        >
          Individual
        </button>
        <button
          className={`btn ${track === "project" ? "btn-accent" : "btn-ghost"}`}
          onClick={() => setTrack("project")}
        >
          Project-level
        </button>
      </div>

      {track === "individual" ? (
        <IndividualEval project={current.slug} />
      ) : (
        <ProjectEvalForm project={current.slug} />
      )}
    </div>
  );
}
