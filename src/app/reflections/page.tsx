"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useHub } from "../providers";
import { ReflectionEditor } from "@/components/ReflectionEditor";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { copyPlainText } from "@/lib/clipboard";
import { PlacementFilter } from "@/components/PlacementFilter";
import {
  placementMatches,
  PLACEMENT_LABEL,
  type PlacementTag,
  type PlacementFilterValue,
} from "@/lib/placement-tag";
import type { ReflectionData } from "@/lib/reflections";
import { buildResearchLabels, formatTagLine } from "@/lib/tag-summary";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function isDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function pretty(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Plain-text rendering of one reflection — matches the single-entry Copy button.
// `tagLine` (research question / sub-question + placement) is included right
// under the header when the reflection carries any such tag.
function formatReflection(
  date: string,
  d: ReflectionData,
  tagLine?: string | null
): string {
  return [
    `Reflection — ${date}`,
    ...(tagLine ? [tagLine] : []),
    "",
    "What did you notice today?",
    d.noticed.trim() || "—",
    "",
    "What did you learn today?",
    d.learned.trim() || "—",
    "",
    "What became clearer today?",
    d.clearer.trim() || "—",
    "",
    "Notes",
    d.notes.trim() || "—",
  ].join("\n");
}

function ReflectionsInner() {
  const { current, loading } = useHub();
  const params = useSearchParams();
  const { scheduleDelete } = usePendingDeletes();
  const [date, setDate] = useState(todayStr());
  const [dates, setDates] = useState<string[]>([]);
  const [placeByDate, setPlaceByDate] = useState<Record<string, PlacementTag | null>>({});
  const [placeFilter, setPlaceFilter] = useState<PlacementFilterValue>("all");
  const [editorKey, setEditorKey] = useState(0);
  const [copiedAll, setCopiedAll] = useState(false);
  // Dates soft-deleted but still within the undo window. The file still exists
  // on disk during that window, so refreshDates would re-add them — this filter
  // keeps them hidden until the delete finalizes (or is undone).
  const [hiddenDates, setHiddenDates] = useState<Set<string>>(new Set());

  // Date is driven by the URL. On any navigation to this page, honor an
  // explicit ?date=YYYY-MM-DD (e.g. from a calendar edit link); otherwise
  // reset to today. Because this reacts to the search params — not just mount —
  // returning here via the sidebar always lands on today, never a stale date.
  useEffect(() => {
    const q = params.get("date");
    setDate(isDate(q) ? q : todayStr());
  }, [params]);

  const refreshDates = useCallback(() => {
    if (!current) return;
    fetch(`/api/reflections?project=${encodeURIComponent(current.slug)}`)
      .then((r) => r.json())
      .then((res) => {
        setDates(res?.dates ?? []);
        const map: Record<string, PlacementTag | null> = {};
        for (const e of res?.entries ?? []) map[e.date] = e.placement ?? null;
        setPlaceByDate(map);
      });
  }, [current]);

  // A save means this date has content and should be visible: un-hide it (covers
  // re-creating a date that was previously deleted) and refresh the list.
  const handleSaved = useCallback(
    (savedDate: string) => {
      setHiddenDates((h) => {
        if (!h.has(savedDate)) return h;
        const n = new Set(h);
        n.delete(savedDate);
        return n;
      });
      refreshDates();
    },
    [refreshDates]
  );

  useEffect(() => {
    refreshDates();
  }, [refreshDates, date]);

  const handleDelete = useCallback(
    (target: string) => {
      if (!current) return;
      const slug = current.slug;
      // Hide from the list (survives refetch via hiddenDates), move the editor
      // off the deleted entry (remount so no stray autosave writes it back),
      // then schedule the real delete.
      setHiddenDates((h) => new Set(h).add(target));
      setDate(todayStr());
      setEditorKey((k) => k + 1);
      scheduleDelete({
        label: `Reflection for ${target} deleted`,
        perform: async () => {
          await fetch(
            `/api/reflections?project=${encodeURIComponent(slug)}&date=${encodeURIComponent(target)}`,
            { method: "DELETE" }
          );
        },
        // Undo: unhide (the file was never removed during the window).
        onUndo: () =>
          setHiddenDates((h) => {
            const n = new Set(h);
            n.delete(target);
            return n;
          }),
      });
    },
    [current, scheduleDelete, refreshDates]
  );

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return (
      <div className="empty-state">
        <h2>No project selected</h2>
        <p>Create or pick a project first.</p>
      </div>
    );

  const visibleDates = dates.filter(
    (d) => !hiddenDates.has(d) && placementMatches(placeByDate[d], placeFilter)
  );

  // Copy every past reflection as plain text, oldest-to-newest, for pasting
  // into a report or handing to Claude at the end of the project period.
  const copyAll = async () => {
    if (!current) return;
    const [res, research] = await Promise.all([
      fetch(
        `/api/reflections?project=${encodeURIComponent(current.slug)}&all=1`
      ).then((r) => r.json()),
      fetch(`/api/research?project=${encodeURIComponent(current.slug)}`).then(
        (r) => r.json()
      ),
    ]);
    const entries: { date: string; data: ReflectionData }[] = res?.entries ?? [];
    if (entries.length === 0) return;
    const labels = buildResearchLabels(research?.items ?? []);
    const text = entries
      .map((e) =>
        formatReflection(
          e.date,
          e.data,
          formatTagLine({
            research: e.data.research,
            placement: e.data.placement,
            labels,
          })
        )
      )
      .join("\n\n────────────────────────\n\n");
    if (await copyPlainText(text)) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div className="label">{current.name}</div>
        <h1>Reflections</h1>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 18 }}
      >
        <div className="card">
          <div className="row between" style={{ marginBottom: 16 }}>
            <div className="label">Entry for</div>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value || todayStr())}
              style={{ width: "auto" }}
            />
          </div>
          {/* key forces a remount (fresh load + save state) when date changes.
              onSaved refreshes the past-entries list so a brand-new date shows
              up immediately, no manual refresh. */}
          <ReflectionEditor
            key={`${date}:${editorKey}`}
            project={current.slug}
            date={date}
            onSaved={() => handleSaved(date)}
            onDelete={() => handleDelete(date)}
          />
        </div>

        <div className="card">
          <div className="row between" style={{ marginBottom: 12 }}>
            <div className="label">Past entries · {visibleDates.length}</div>
            {visibleDates.length > 0 && (
              <button className="btn btn-ghost" onClick={copyAll}>
                {copiedAll ? "Copied ✓" : "Copy all"}
              </button>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <PlacementFilter value={placeFilter} onChange={setPlaceFilter} />
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {visibleDates.length === 0 && (
              <div className="muted" style={{ fontSize: 14 }}>
                No reflections yet.
              </div>
            )}
            {visibleDates.map((d) => (
              <button
                key={d}
                className={`nav-link ${d === date ? "active" : ""}`}
                style={{ justifyContent: "space-between" }}
                onClick={() => setDate(d)}
              >
                <span>{pretty(d)}</span>
                <span className="row" style={{ gap: 6 }}>
                  {placeByDate[d] && (
                    <span className="chip chip-placement">
                      {PLACEMENT_LABEL[placeByDate[d] as PlacementTag]}
                    </span>
                  )}
                  {d === todayStr() && <span className="chip">today</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReflectionsPage() {
  // useSearchParams requires a Suspense boundary.
  return (
    <Suspense fallback={<div className="muted">Loading…</div>}>
      <ReflectionsInner />
    </Suspense>
  );
}
