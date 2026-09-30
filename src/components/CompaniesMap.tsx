"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Company } from "@/lib/companies";
import type { MapView } from "@/lib/settings";

/** Neutral fallback if no default view is supplied. */
const FALLBACK_VIEW: MapView = { lat: 20, lng: 0, zoom: 2 };

/**
 * Leaflet + OpenStreetMap map. Plain Leaflet (no react-leaflet) to stay
 * compatible with React 19 and avoid marker-image bundling issues — pins are
 * CSS `divIcon`s, so no image assets are needed.
 *
 * Two modes, driven by props:
 *  - Overview: pass `companies` (+ `onSelect`) to show a pin per located company.
 *  - Pick: pass `pickMode` (+ `pick`, `onPick`) so clicking the map sets a
 *    single coordinate — used by the add/edit form to place a company.
 *
 * Loaded via next/dynamic({ ssr:false }) from the page, so Leaflet never runs
 * during SSR.
 */
function pinIcon(status: Company["status"], active = false) {
  return L.divIcon({
    className: "",
    html: `<span class="map-pin ${status} ${active ? "active" : ""}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function CompaniesMap({
  companies = [],
  onSelect,
  height = 460,
  pickMode = false,
  pick = null,
  onPick,
  defaultView,
  onSetDefault,
}: {
  companies?: Company[];
  onSelect?: (id: string) => void;
  height?: number;
  pickMode?: boolean;
  pick?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  /** Fallback center + zoom used before any pins exist (from settings). */
  defaultView?: MapView;
  /** When provided, shows a control that saves the current view as the default. */
  onSetDefault?: (v: MapView) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef<L.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onPickRef = useRef(onPick);
  // Read the latest default in the run-once init effect without re-initing.
  const defaultViewRef = useRef(defaultView);
  onSelectRef.current = onSelect;
  onPickRef.current = onPick;
  defaultViewRef.current = defaultView;
  const [savedFlash, setSavedFlash] = useState(false);

  // Init once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    // Default view comes from settings (a neutral world view out of the box) so
    // the app ships without pointing at any particular place. Overridden by
    // fitBounds when pins exist.
    // fadeAnimation:false is deliberate, not cosmetic: with the tile fade on,
    // Leaflet's GridLayer._tileReady schedules a requestAnimFrame(_updateOpacity)
    // and a setTimeout(_pruneTiles, 250) whose ids it never stores, so
    // map.remove() can't cancel them. If the map is unmounted (navigating away)
    // within that window they fire against a map whose _mapPane has been deleted
    // → getPosition(undefined) → "Cannot read properties of undefined
    // (reading '_leaflet_pos')". Disabling fade removes those deferred callbacks.
    const view = defaultViewRef.current ?? FALLBACK_VIEW;
    const map = L.map(elRef.current, {
      scrollWheelZoom: true,
      fadeAnimation: false,
    }).setView([view.lat, view.lng], view.zoom, { animate: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The container may size after mount; recalc so tiles fill it. Cancel on
    // unmount and guard, so this never runs against a removed map.
    const sizeTimer = setTimeout(() => {
      if (mapRef.current === map) map.invalidateSize(false);
    }, 0);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onPickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      clearTimeout(sizeTimer);
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      pickRef.current = null;
    };
  }, []);

  // Render company pins + fit bounds (overview mode).
  useEffect(() => {
    const map = mapRef.current;
    const group = markersRef.current;
    if (!map || !group || pickMode) return;
    group.clearLayers();
    const located = companies.filter(
      (c) => c.lat != null && c.lng != null
    );
    const pts: [number, number][] = [];
    for (const c of located) {
      const m = L.marker([c.lat as number, c.lng as number], {
        icon: pinIcon(c.status),
      });
      const site = c.website
        ? `<br/><a href="${c.website}" target="_blank" rel="noreferrer">${c.website}</a>`
        : "";
      m.bindPopup(
        `<strong>${escapeHtml(c.name)}</strong><br/>${
          c.status === "visited" ? "Visited" : "Planned"
        }${c.address ? `<br/>${escapeHtml(c.address)}` : ""}${site}`
      );
      // Permanent name label so pins are identifiable without clicking.
      m.bindTooltip(c.name, {
        permanent: true,
        direction: "right",
        offset: [8, 0],
        className: "map-label",
      });
      m.on("click", () => onSelectRef.current?.(c.id));
      m.addTo(group);
      pts.push([c.lat as number, c.lng as number]);
    }
    // animate:false — an in-flight pan/zoom animation left running when the map
    // is removed on navigation is another source of the _leaflet_pos crash.
    if (pts.length === 1) {
      map.setView(pts[0], 12, { animate: false });
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2), { animate: false });
    }
  }, [companies, pickMode]);

  // Single marker for pick mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickMode) return;
    if (pick && pick.lat != null && pick.lng != null) {
      if (!pickRef.current) {
        pickRef.current = L.marker([pick.lat, pick.lng], {
          icon: pinIcon("planned", true),
          draggable: true,
        }).addTo(map);
        pickRef.current.on("dragend", () => {
          const ll = pickRef.current!.getLatLng();
          onPickRef.current?.(ll.lat, ll.lng);
        });
      } else {
        pickRef.current.setLatLng([pick.lat, pick.lng]);
      }
      map.setView([pick.lat, pick.lng], Math.max(map.getZoom(), 12), {
        animate: false,
      });
    } else if (pickRef.current) {
      map.removeLayer(pickRef.current);
      pickRef.current = null;
    }
  }, [pick, pickMode]);

  function saveCurrentAsDefault() {
    const map = mapRef.current;
    if (!map || !onSetDefault) return;
    const c = map.getCenter();
    onSetDefault({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }

  return (
    <div style={{ position: "relative", height, width: "100%" }}>
      <div
        ref={elRef}
        className="companies-map"
        style={{ height: "100%", width: "100%" }}
      />
      {onSetDefault && (
        <button
          type="button"
          className="map-set-default"
          onClick={saveCurrentAsDefault}
          title="Remember this center and zoom as the default view for maps with no pins yet"
        >
          {savedFlash ? "✓ Saved as default" : "Set as default view"}
        </button>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
