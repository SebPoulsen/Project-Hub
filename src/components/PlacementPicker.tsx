"use client";

import {
  PLACEMENT_TAGS,
  type PlacementTag,
} from "@/lib/placement-tag";

/**
 * Single-select placement tag chips (Primary / Secondary / Both). Clicking the
 * active chip again clears it (unset). Same lightweight chip style as the
 * research-question picker. `compact` drops the leading label for tight rows.
 */
export function PlacementPicker({
  value,
  onChange,
  compact = false,
}: {
  value: PlacementTag | null;
  onChange: (v: PlacementTag | null) => void;
  compact?: boolean;
}) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {!compact && (
        <span className="label" style={{ marginRight: 2 }}>
          Placement
        </span>
      )}
      {PLACEMENT_TAGS.map((t) => {
        const on = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            className={`chip chip-toggle ${on ? "on" : ""}`}
            onClick={() => onChange(on ? null : t.value)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
