"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Company } from "@/lib/companies";

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
}: {
  companies?: Company[];
  onSelect?: (id: string) => void;
  height?: number;
  pickMode?: boolean;
  pick?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef<L.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onPickRef = useRef(onPick);
  onSelectRef.current = onSelect;
  onPickRef.current = onPick;

  // Init once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    // Default view: Aarhus, Denmark, moderately zoomed — so a new entry doesn't
    // start on a full world view. Overridden by fitBounds when pins exist.
    const map = L.map(elRef.current, { scrollWheelZoom: true }).setView(
      [56.1629, 10.2039],
      11
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The container may size after mount; recalc so tiles fill it.
    setTimeout(() => map.invalidateSize(), 0);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onPickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    return () => {
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
    if (pts.length === 1) {
      map.setView(pts[0], 12);
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2));
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
      map.setView([pick.lat, pick.lng], Math.max(map.getZoom(), 12));
    } else if (pickRef.current) {
      map.removeLayer(pickRef.current);
      pickRef.current = null;
    }
  }, [pick, pickMode]);

  return (
    <div
      ref={elRef}
      className="companies-map"
      style={{ height, width: "100%" }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
