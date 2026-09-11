"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHub } from "../providers";
import {
  emptyPlacement,
  type Placement,
  type PlacementInfo,
} from "@/lib/placement";

type SaveState = "idle" | "dirty" | "saving" | "saved";
const DEBOUNCE_MS = 1500;

const FIELDS: { key: keyof PlacementInfo; label: string; type?: string; ph?: string }[] = [
  { key: "organisation", label: "Organisation", ph: "Company / institution" },
  { key: "location", label: "Location", ph: "City / address" },
  { key: "supervisor", label: "Supervisor", ph: "Contact person" },
  { key: "contactEmail", label: "Contact email", type: "email", ph: "name@example.com" },
  { key: "focus", label: "Focus / role", ph: "What you're doing there" },
  { key: "startDate", label: "Start date", type: "date" },
  { key: "endDate", label: "End date", type: "date" },
];

export default function PlacementPage() {
  const { current, loading, reloadProjects } = useHub();
  const [data, setData] = useState<Placement>(emptyPlacement());
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Placement>(data);
  latest.current = data;
  const slugRef = useRef<string | null>(null);

  // Load from the current project whenever it changes.
  useEffect(() => {
    if (!current) return;
    slugRef.current = current.slug;
    setData(current.placement ?? emptyPlacement());
    setState("idle");
  }, [current]);

  const save = useCallback(async () => {
    const slug = slugRef.current;
    if (!slug) return;
    setState("saving");
    await fetch(`/api/projects?slug=${encodeURIComponent(slug)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placement: latest.current }),
    });
    setState("saved");
    reloadProjects();
  }, [reloadProjects]);

  const scheduleSave = useCallback(() => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, DEBOUNCE_MS);
  }, [save]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const update = (
    side: keyof Placement,
    key: keyof PlacementInfo,
    value: string
  ) => {
    setData((d) => ({
      ...d,
      [side]: {
        ...d[side],
        [key]: (key === "startDate" || key === "endDate") && value === ""
          ? null
          : value,
      },
    }));
    scheduleSave();
  };

  const flushOnBlur = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (state === "dirty" || state === "saving") save();
  };

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return (
      <div className="empty-state">
        <h2>No project selected</h2>
        <p>Create or pick a project first.</p>
      </div>
    );

  const label =
    state === "saving"
      ? "Saving…"
      : state === "dirty"
      ? "Unsaved changes"
      : state === "saved"
      ? "Saved ✓"
      : "";

  return (
    <div>
      <div className="page-head">
        <div className="row between">
          <div>
            <div className="label">{current.name}</div>
            <h1>Placement</h1>
          </div>
          <span className={`save-state ${state === "saving" ? "saving" : ""}`}>
            {label}
          </span>
        </div>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }}
      >
        {(["primary", "secondary"] as const).map((side) => (
          <div className="card" key={side}>
            <div className="label" style={{ marginBottom: 12 }}>
              {side === "primary" ? "Primary placement" : "Secondary placement"}
            </div>
            <div className="stack">
              {FIELDS.map((f) => (
                <label className="stack" style={{ gap: 4 }} key={f.key}>
                  <span className="label">{f.label}</span>
                  <input
                    type={f.type ?? "text"}
                    placeholder={f.ph}
                    value={(data[side][f.key] as string) ?? ""}
                    onChange={(e) => update(side, f.key, e.target.value)}
                    onBlur={flushOnBlur}
                    style={f.type === "date" ? { width: "auto" } : undefined}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
