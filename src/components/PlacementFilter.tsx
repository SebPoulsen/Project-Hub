"use client";

import {
  PLACEMENT_TAGS,
  type PlacementFilterValue,
} from "@/lib/placement-tag";

/** Segmented All / Primary / Secondary / Both filter for a list view. */
export function PlacementFilter({
  value,
  onChange,
}: {
  value: PlacementFilterValue;
  onChange: (v: PlacementFilterValue) => void;
}) {
  const opts: { value: PlacementFilterValue; label: string }[] = [
    { value: "all", label: "All" },
    ...PLACEMENT_TAGS,
  ];
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span className="label" style={{ marginRight: 2 }}>
        Placement
      </span>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`chip chip-toggle ${value === o.value ? "on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
