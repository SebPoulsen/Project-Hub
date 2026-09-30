"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useHub } from "../providers";
import { usePendingDeletes } from "@/components/PendingDeletes";
import { PlacementPicker } from "@/components/PlacementPicker";
import { PlacementFilter } from "@/components/PlacementFilter";
import {
  placementMatches,
  PLACEMENT_LABEL,
  type PlacementTag,
  type PlacementFilterValue,
} from "@/lib/placement-tag";
import type { Company, CompanyStatus } from "@/lib/companies";
import type { CalendarEvent } from "@/lib/events";

// Leaflet touches window at import — load the map client-only.
const CompaniesMap = dynamic(() => import("@/components/CompaniesMap"), {
  ssr: false,
  loading: () => (
    <div className="companies-map" style={{ height: 460 }}>
      <div className="muted" style={{ padding: 16 }}>
        Loading map…
      </div>
    </div>
  ),
});

/** "2026-09-20" -> "Sep 20", for the compact event back-links on a card. */
function shortDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type FormMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

interface FormState {
  name: string;
  status: CompanyStatus;
  address: string;
  website: string;
  notes: string;
  visitDate: string;
  lat: number | null;
  lng: number | null;
  placement: PlacementTag | null;
}

const EMPTY_FORM: FormState = {
  name: "",
  status: "planned",
  address: "",
  website: "",
  notes: "",
  visitDate: "",
  lat: null,
  lng: null,
  placement: null,
};

export default function CompaniesPage() {
  const { current, loading, mapDefault, setMapDefault } = useHub();
  const { scheduleDelete } = usePendingDeletes();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [eventsByCompany, setEventsByCompany] = useState<
    Record<string, CalendarEvent[]>
  >({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [placeFilter, setPlaceFilter] = useState<PlacementFilterValue>("all");
  const [mode, setMode] = useState<FormMode>({ kind: "closed" });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [geo, setGeo] = useState<"idle" | "searching" | "notfound" | "error">(
    "idle"
  );

  const load = useCallback(async () => {
    if (!current) return;
    const [cRes, eRes] = await Promise.all([
      fetch(`/api/companies?project=${encodeURIComponent(current.slug)}`).then(
        (r) => r.json()
      ),
      fetch(`/api/events?project=${encodeURIComponent(current.slug)}`).then((r) =>
        r.json()
      ),
    ]);
    setCompanies(cRes?.items ?? []);
    // Group events under the company they reference, for the card back-links.
    const byCompany: Record<string, CalendarEvent[]> = {};
    (eRes?.items ?? []).forEach((e: CalendarEvent) => {
      if (e.companyId) (byCompany[e.companyId] ??= []).push(e);
    });
    setEventsByCompany(byCompany);
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  // Deep-link support: /companies?focus=<id> (from an event's company chip, or
  // the map) brings that card into view and flashes it, once, after load.
  const didFocus = useRef(false);
  useEffect(() => {
    if (didFocus.current || companies.length === 0) return;
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (!focus) return;
    didFocus.current = true;
    setHighlightId(focus);
    requestAnimationFrame(() => {
      document
        .getElementById(`company-${focus}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const t = setTimeout(
      () => setHighlightId((h) => (h === focus ? null : h)),
      1700
    );
    return () => clearTimeout(t);
  }, [companies.length]);

  if (loading) return <div className="muted">Loading…</div>;
  if (!current)
    return (
      <div className="empty-state">
        <h2>No project selected</h2>
        <p>Create or pick a project first.</p>
      </div>
    );

  const slug = current.slug;
  const visible = companies.filter(
    (c) => !pendingIds.has(c.id) && placementMatches(c.placement, placeFilter)
  );
  const planned = visible.filter((c) => c.status === "planned");
  const visited = visible.filter((c) => c.status === "visited");

  function openCreate() {
    setForm(EMPTY_FORM);
    setGeo("idle");
    setMode({ kind: "create" });
  }

  function openEdit(c: Company) {
    setForm({
      name: c.name,
      status: c.status,
      address: c.address,
      website: c.website,
      notes: c.notes,
      visitDate: c.visitDate ?? "",
      lat: c.lat,
      lng: c.lng,
      placement: c.placement,
    });
    setGeo("idle");
    setMode({ kind: "edit", id: c.id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setMode({ kind: "closed" });
    setForm(EMPTY_FORM);
  }

  async function submit() {
    if (mode.kind === "closed") return;
    if (!form.name.trim() && !form.address.trim()) return;
    setBusy(true);
    const payload = {
      ...form,
      visitDate: form.status === "visited" ? form.visitDate || null : null,
    };
    if (mode.kind === "create") {
      await fetch(`/api/companies?project=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(
        `/api/companies?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(mode.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
    }
    setBusy(false);
    closeForm();
    load();
  }

  async function toggleStatus(c: Company) {
    const status: CompanyStatus = c.status === "visited" ? "planned" : "visited";
    setCompanies((cs) =>
      cs.map((x) => (x.id === c.id ? { ...x, status } : x))
    );
    await fetch(
      `/api/companies?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(c.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
    load();
  }

  function remove(c: Company) {
    setPendingIds((p) => new Set(p).add(c.id));
    if (mode.kind === "edit" && mode.id === c.id) setMode({ kind: "closed" });
    scheduleDelete({
      label: `Company "${c.name}" deleted`,
      perform: async () => {
        await fetch(
          `/api/companies?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(c.id)}`,
          { method: "DELETE", keepalive: true }
        );
      },
      onUndo: () =>
        setPendingIds((p) => {
          const n = new Set(p);
          n.delete(c.id);
          return n;
        }),
    });
  }

  // Pin click on the overview map: bring the matching card into view and flash
  // it — editing stays a deliberate action via the card's Edit button.
  function highlightCompany(id: string) {
    setHighlightId(id);
    requestAnimationFrame(() => {
      document
        .getElementById(`company-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1700);
  }

  // Set coordinates from a map click/drag, and try to reverse-geocode them into
  // the address field — but only when it's empty, so a typed address isn't
  // clobbered. Pin placement never blocks on the lookup (offline is fine).
  async function handlePick(lat: number, lng: number) {
    setForm((f) => ({ ...f, lat, lng }));
    if (form.address.trim()) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      if (data?.display_name) {
        setForm((f) => (f.address.trim() ? f : { ...f, address: data.display_name }));
      }
    } catch {
      // No network / lookup failed — leave the address empty and editable.
    }
  }

  // Geocode the typed address via OpenStreetMap Nominatim (on explicit click,
  // low volume). Fills lat/lng so the company gets a map pin.
  async function geocode() {
    const q = form.address.trim() || form.name.trim();
    if (!q) return;
    setGeo("searching");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } }
      );
      const hits = await res.json();
      if (Array.isArray(hits) && hits[0]) {
        setForm((f) => ({
          ...f,
          lat: Number(hits[0].lat),
          lng: Number(hits[0].lon),
        }));
        setGeo("idle");
      } else {
        setGeo("notfound");
      }
    } catch {
      setGeo("error");
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="row between">
          <div>
            <div className="label">{current.name}</div>
            <h1>Companies &amp; visits</h1>
          </div>
          {mode.kind === "closed" && (
            <button className="btn btn-accent" onClick={openCreate}>
              + New company
            </button>
          )}
        </div>
      </div>

      {mode.kind !== "closed" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            {mode.kind === "edit" ? "Edit company" : "New company"}
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }}
          >
            <div className="stack">
              <input
                type="text"
                placeholder="Company / site name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <div className="row" style={{ gap: 6 }}>
                <button
                  className={`btn ${form.status === "planned" ? "btn-accent" : "btn-ghost"}`}
                  onClick={() => setForm((f) => ({ ...f, status: "planned" }))}
                >
                  Idea to visit
                </button>
                <button
                  className={`btn ${form.status === "visited" ? "btn-accent" : "btn-ghost"}`}
                  onClick={() => setForm((f) => ({ ...f, status: "visited" }))}
                >
                  Visited
                </button>
              </div>
              {form.status === "visited" && (
                <label className="stack" style={{ gap: 4 }}>
                  <span className="label">Visit date</span>
                  <input
                    type="date"
                    value={form.visitDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, visitDate: e.target.value }))
                    }
                    style={{ width: "auto" }}
                  />
                </label>
              )}
              <input
                type="text"
                placeholder="Address / location"
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
              />
              <input
                type="text"
                placeholder="Website (optional)"
                value={form.website}
                onChange={(e) =>
                  setForm((f) => ({ ...f, website: e.target.value }))
                }
              />
              <textarea
                placeholder="Notes…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                style={{ minHeight: 80 }}
              />
              <PlacementPicker
                value={form.placement}
                onChange={(p) => setForm((f) => ({ ...f, placement: p }))}
              />
            </div>

            <div className="stack">
              <div className="row between">
                <span className="label">
                  {form.lat != null && form.lng != null
                    ? `📍 ${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}`
                    : "No location set"}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-ghost" onClick={geocode}>
                    {geo === "searching" ? "Searching…" : "Find on map"}
                  </button>
                  {form.lat != null && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setForm((f) => ({ ...f, lat: null, lng: null }))}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {geo === "notfound" && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Couldn’t find that address — try refining it, or click the map.
                </div>
              )}
              {geo === "error" && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Lookup failed (offline?) — click the map to set a point.
                </div>
              )}
              <CompaniesMap
                height={280}
                pickMode
                defaultView={mapDefault}
                pick={
                  form.lat != null && form.lng != null
                    ? { lat: form.lat, lng: form.lng }
                    : null
                }
                onPick={handlePick}
              />
              <div className="muted" style={{ fontSize: 12 }}>
                Click the map (or drag the pin) to set the exact location.
              </div>
            </div>
          </div>

          <div className="row between" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={closeForm}>
              Cancel
            </button>
            <button className="btn btn-accent" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : mode.kind === "edit" ? "Save changes" : "Save company"}
            </button>
          </div>
        </div>
      )}

      {/* Overview map */}
      <div className="card" style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
        <CompaniesMap
          companies={visible}
          height={420}
          defaultView={mapDefault}
          onSelect={highlightCompany}
          onSetDefault={setMapDefault}
        />
      </div>
      <div className="row between" style={{ gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 16 }}>
          <span className="row" style={{ gap: 6 }}>
            <span className="map-pin planned" style={{ position: "relative" }} />
            <span className="muted" style={{ fontSize: 13 }}>Idea to visit</span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <span className="map-pin visited" style={{ position: "relative" }} />
            <span className="muted" style={{ fontSize: 13 }}>Visited</span>
          </span>
        </div>
        {companies.some((c) => !pendingIds.has(c.id)) && (
          <PlacementFilter value={placeFilter} onChange={setPlaceFilter} />
        )}
      </div>

      {companies.some((c) => !pendingIds.has(c.id)) ? (
        visible.length === 0 && (
          <div className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
            No companies match this placement filter.
          </div>
        )
      ) : (
        <div className="empty-state">
          <h2>No companies yet</h2>
          <p>Add companies you’ve visited or want to visit, and they’ll pin on the map.</p>
        </div>
      )}

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }}
      >
        <CompanyColumn
          title="Ideas to visit"
          companies={planned}
          eventsByCompany={eventsByCompany}
          highlightId={highlightId}
          onEdit={openEdit}
          onDelete={remove}
          onToggle={toggleStatus}
        />
        <CompanyColumn
          title="Visited"
          companies={visited}
          eventsByCompany={eventsByCompany}
          highlightId={highlightId}
          onEdit={openEdit}
          onDelete={remove}
          onToggle={toggleStatus}
        />
      </div>
    </div>
  );
}

function CompanyColumn({
  title,
  companies,
  eventsByCompany,
  highlightId,
  onEdit,
  onDelete,
  onToggle,
}: {
  title: string;
  companies: Company[];
  eventsByCompany: Record<string, CalendarEvent[]>;
  highlightId: string | null;
  onEdit: (c: Company) => void;
  onDelete: (c: Company) => void;
  onToggle: (c: Company) => void;
}) {
  return (
    <div>
      <div className="tsection-head">
        <span className="tsection-title">{title}</span>
        <span className="tsection-count">{companies.length}</span>
      </div>
      <div className="stack" style={{ gap: 12, marginTop: 10 }}>
        {companies.length === 0 ? (
          <div className="tempty">Nothing here yet.</div>
        ) : (
          companies.map((c) => (
            <div
              key={c.id}
              id={`company-${c.id}`}
              className={`card ${highlightId === c.id ? "company-highlight" : ""}`}
            >
              <div className="row between">
                <h3 style={{ margin: 0, fontSize: 17 }}>{c.name}</h3>
                <span className="row" style={{ gap: 6 }}>
                  {c.placement && (
                    <span className="chip chip-placement">
                      {PLACEMENT_LABEL[c.placement]}
                    </span>
                  )}
                  <span className={`chip company-status ${c.status}`}>
                    {c.status === "visited" ? "Visited" : "Planned"}
                  </span>
                </span>
              </div>
              {c.address && (
                <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>
                  {c.lat != null ? "📍 " : ""}
                  {c.address}
                </div>
              )}
              {c.status === "visited" && c.visitDate && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Visited {c.visitDate}
                </div>
              )}
              {c.website && (
                <div style={{ marginTop: 6 }}>
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="link-accent"
                    style={{ fontSize: 13 }}
                  >
                    {c.website}
                  </a>
                </div>
              )}
              {c.notes && (
                <p
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 14,
                    lineHeight: 1.5,
                    marginTop: 8,
                    overflowWrap: "anywhere",
                  }}
                >
                  {c.notes}
                </p>
              )}
              {(eventsByCompany[c.id]?.length ?? 0) > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="label" style={{ marginBottom: 4 }}>
                    Events
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {eventsByCompany[c.id].map((e) => (
                      <Link
                        key={e.id}
                        href={`/calendar?date=${e.date}`}
                        className="chip chip-research"
                      >
                        📅 {e.title} · {shortDate(e.date)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <div className="row between" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => onToggle(c)}>
                  {c.status === "visited" ? "Mark planned" : "Mark visited"}
                </button>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-ghost" onClick={() => onEdit(c)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost danger"
                    onClick={() => onDelete(c)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
