"use client";

import { useRef, useState } from "react";
import type { EvalCategory, EvalItem, EvalSet } from "@/lib/evaluations-shared";

// Distinct color per evaluation set, assigned by its order. Dashed for all.
const SET_PALETTE = [
  "#1d9e75", // green
  "#eb6834", // orange
  "#2a78d6", // blue
  "#eda100", // yellow
  "#6250d6", // violet
  "#e34948", // red
  "#e87ba4", // magenta
  "#199e70",
];

export function setColor(index: number): string {
  return SET_PALETTE[index % SET_PALETTE.length];
}

const CAT_ORDER: EvalCategory[] = ["skill", "knowledge", "attitude", "wildcard"];
const CAT_LABEL: Record<EvalCategory, string> = {
  skill: "Skill",
  knowledge: "Knowledge",
  attitude: "Attitude",
  wildcard: "Wild card",
};

/**
 * Redesigned individual chart: one dashed line per evaluation set. X-axis is all
 * 14 items in fixed order, grouped by category (labels + thin separators);
 * Y-axis is 1–10 (all labels, no gridlines). A highlighted set is emphasized;
 * the rest dim.
 */
export function EvalChart({
  items,
  sets,
  highlightSetId,
}: {
  items: EvalItem[];
  sets: EvalSet[];
  highlightSetId: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    setId: string;
    name: string;
    color: string;
    x: number;
    y: number;
    flip: boolean;
  } | null>(null);

  // Items in fixed category order.
  const ordered = CAT_ORDER.flatMap((c) => items.filter((i) => i.category === c));

  const startX = 44;
  const step = 42;
  const gap = 16;
  const plotTop = 40;
  const plotBottom = 250;
  const axisY = 258;

  // X position per item, with an extra gap between category groups.
  const xs: number[] = [];
  let x = startX;
  let prevCat: EvalCategory | null = null;
  ordered.forEach((it, i) => {
    if (prevCat && it.category !== prevCat) x += gap;
    xs[i] = x;
    x += step;
    prevCat = it.category;
  });
  const W = (xs[xs.length - 1] ?? startX) + 24;
  const H = 340;

  const yAt = (v: number) => plotBottom - ((v - 1) / 9) * (plotBottom - plotTop);

  // Group ranges (first/last index per category) for labels + separators.
  const groups: { cat: EvalCategory; first: number; last: number }[] = [];
  ordered.forEach((it, i) => {
    const g = groups[groups.length - 1];
    if (g && g.cat === it.category) g.last = i;
    else groups.push({ cat: it.category, first: i, last: i });
  });

  function pointsFor(set: EvalSet): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    ordered.forEach((it, i) => {
      const v = set.ratings[it.id];
      if (typeof v === "number") pts.push({ x: xs[i], y: yAt(v) });
    });
    return pts;
  }

  // Hover takes visual precedence over the clicked highlight.
  const activeId = hover?.setId ?? highlightSetId;
  const anyActive = !!activeId;

  function onSetMove(e: React.MouseEvent, set: EvalSet, idx: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHover({
      setId: set.id,
      name: set.name,
      color: setColor(idx),
      x,
      y,
      flip: x > rect.width - 160,
    });
  }

  return (
    <div className="eval-chart" ref={wrapRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Evaluation ratings across the 14 items, one line per evaluation set"
        onMouseLeave={() => setHover(null)}
      >
        {/* Category separators (grouping aids, not value gridlines) */}
        {groups.slice(0, -1).map((g, gi) => {
          const sepX = (xs[g.last] + xs[groups[gi + 1].first]) / 2;
          return (
            <line
              key={`sep-${gi}`}
              x1={sepX}
              x2={sepX}
              y1={34}
              y2={axisY}
              stroke="var(--border)"
              strokeWidth={1}
            />
          );
        })}

        {/* Category labels */}
        {groups.map((g) => (
          <text
            key={`cat-${g.cat}`}
            x={(xs[g.first] + xs[g.last]) / 2}
            y={30}
            textAnchor="middle"
            className="eval-cat"
          >
            {CAT_LABEL[g.cat]}
          </text>
        ))}

        {/* Y labels 1–10 (no gridlines) */}
        {Array.from({ length: 10 }, (_, k) => k + 1).map((v) => (
          <text key={v} x={26} y={yAt(v) + 3} textAnchor="end" className="eval-axis">
            {v}
          </text>
        ))}

        {/* X baseline */}
        <line x1={32} x2={W - 10} y1={axisY} y2={axisY} stroke="var(--border-strong)" strokeWidth={1} />

        {/* One dashed line per set */}
        {sets.map((set, idx) => {
          const pts = pointsFor(set);
          if (pts.length === 0) return null;
          const color = setColor(idx);
          const dim = anyActive && set.id !== activeId;
          const emphasized = anyActive && set.id === activeId;
          const d = pts
            .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(" ");
          return (
            <g
              key={set.id}
              opacity={dim ? 0.2 : 1}
              style={{ cursor: "pointer" }}
              onMouseMove={(e) => onSetMove(e, set, idx)}
              onMouseEnter={(e) => onSetMove(e, set, idx)}
              onMouseLeave={() => setHover(null)}
            >
              {/* Invisible hit-area tracking the line so hovering the dashed
                  stroke is easy — but only near the line, not the whole plot. */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={10}
                style={{ pointerEvents: "stroke" }}
              />
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={emphasized ? 3 : 2}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ pointerEvents: "none" }}
              />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={emphasized ? 4 : 3} fill={color} />
              ))}
            </g>
          );
        })}

        {/* Item labels, rotated */}
        {ordered.map((it, i) => {
          const raw = it.label || `Item ${i + 1}`;
          const label = raw.length > 16 ? raw.slice(0, 15) + "…" : raw;
          return (
            <text
              key={it.id}
              x={xs[i]}
              y={axisY + 8}
              textAnchor="end"
              transform={`rotate(-40 ${xs[i]} ${axisY + 8})`}
              className="eval-item"
            >
              {label}
            </text>
          );
        })}
      </svg>

      {hover && (
        <div
          className="eval-tip"
          style={{
            left: hover.x,
            top: hover.y,
            transform: hover.flip
              ? "translate(calc(-100% - 12px), -50%)"
              : "translate(12px, -50%)",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 12,
              height: 3,
              borderRadius: 2,
              background: hover.color,
              display: "inline-block",
            }}
          />
          {hover.name}
        </div>
      )}
    </div>
  );
}
