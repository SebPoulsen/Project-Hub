"use client";
import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/lib/useScrollLock";
import { PlacementPicker } from "@/components/PlacementPicker";
import { type PlacementTag } from "@/lib/placement-tag";
import type { CalendarEvent } from "@/lib/events";
import type { Company } from "@/lib/companies";
interface FormState {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  companyId: string;
  placement: PlacementTag | null;
}
function emptyForm(date: string): FormState {
  return {
    title: "",
    date,
    startTime: "",
    endTime: "",
    notes: "",
    companyId: "",
    placement: null,
  };
}
/**
 * Modal add/edit form for a calendar event. Explicit Save (not autosave) — a
 * short structured form, same interaction as the Companies form. Reused by the
 * calendar header button and the day-detail Events section.
 */
export function EventEditor({
  project,
  event,
  date,
  companies,
  onClose,
  onSaved,
}: {
  project: string;
  event: CalendarEvent | null; // null = create
  date: string; // prefill date on create
  companies: Company[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    event
      ? {
          title: event.title,
          date: event.date,
          startTime: event.startTime ?? "",
          endTime: event.endTime ?? "",
          notes: event.notes,
          companyId: event.companyId ?? "",
          placement: event.placement,
        }
      : emptyForm(date)
  );
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLInputElement>(null);
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isFullTime = (v: string) => /^\d{2}:\d{2}$/.test(v);
  // Once the start field is fully filled (all segments entered, or a value
  // picked), move focus to the end field so the user can type/open it. Only on
  // the incomplete→complete transition, so re-editing a filled start doesn't
  // yank focus; we place focus but never auto-open the end picker.
  function onStartChange(v: string) {
    const wasComplete = isFullTime(form.startTime);
    set("startTime", v);
    if (!wasComplete && isFullTime(v)) endRef.current?.focus();
  }
  async function save() {
    if (!form.title.trim() || !form.date) return;
    setBusy(true);
    const payload = {
      title: form.title,
      date: form.date,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      notes: form.notes,
      companyId: form.companyId || null,
      placement: form.placement,
    };
    const base = `/api/events?project=${encodeURIComponent(project)}`;
    if (event) {
      await fetch(`${base}&id=${encodeURIComponent(event.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setBusy(false);
    onSaved();
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{event ? "Edit event" : "New event"}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <label className="label">Title</label>
            <input
              type="text"
              value={form.title}
              autoFocus
              placeholder="e.g. Startvækst Aarhus kickoff"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <label className="label">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div style={{ flex: "0 1 110px" }}>
              <label className="label">Start</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => onStartChange(e.target.value)}
              />
            </div>
            <div style={{ flex: "0 1 110px" }}>
              <label className="label">End</label>
              <input
                ref={endRef}
                type="time"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Company (optional)</label>
            <select
              value={form.companyId}
              onChange={(e) => set("companyId", e.target.value)}
            >
              <option value="">— none —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              rows={3}
              value={form.notes}
              placeholder="Description, agenda, location details…"
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
          <PlacementPicker
            value={form.placement}
            onChange={(v) => set("placement", v)}
          />
        </div>
        <div
          className="row"
          style={{ justifyContent: "flex-end", gap: 6, marginTop: 18 }}
        >
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-accent"
            disabled={busy || !form.title.trim() || !form.date}
            onClick={save}
          >
            {busy ? "Saving…" : "Save event"}
          </button>
        </div>
      </div>
    </div>
  );
}
