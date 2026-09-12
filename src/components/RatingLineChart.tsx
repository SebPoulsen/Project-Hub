"use client";

import { useRef, useState } from "react";

// Distinct color per evaluation set, assigned by order. Dashed for all lines.
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

export interface ChartColumn {
  key: string;
  label: string; // x-axis label (short)
  group?: string; // optional category grouping (separators + group labels)
}

export interface ChartSeries {
  id: string;
  name: string;
  color: string;
  values: Record<string, number | null>; // column key -> 1..10 or null
}

/**
 * One dashed line per series across a fixed set of columns (x). Y is 1–10 with
 * all labels and no gridlines. When columns carry `group`, groups are separated
 * by a gap + thin separator and labelled above. Hovering a line shows a
 * name+color tooltip and emphasizes it; a highlighted series is emphasized too.
 */
export function RatingLineChart({
  columns,
  series,
  highlightId,
}: {
  columns: ChartColumn[];
  series: ChartSeries[];
  highlightId: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
    flip: boolean;
  } | null>(null);

  const W = 680;
  const H = 340;
  const startX = 44;
  const plotRight = W - 40;
  const plotTop = 40;
  const plotBottom = 250;
  const axisY = 258;

  const hasGroups = columns.some((c) => c.group);
  const gap = hasGroups ? 16 : 0;

  // Group ranges (consecutive same group) for labels + separators.
  const groups: { group: string; first: number; last: number }[] = [];
  columns.forEach((c, i) => {
    const g = groups[groups.length - 1];
    if (g && g.group === (c.group ?? "")) g.last = i;
    else groups.push({ group: c.group ?? "", first: i, last: i });
  });
  const nGroups = groups.length;

  const n = columns.length;
  const step =
    n <= 1 ? 0 : (plotRight - startX - (nGroups - 1) * gap) / (n - 1);

  // X per column, with an extra gap at each group boundary.
  const xs: number[] = [];
  let gi = 0;
  columns.forEach((c, i) => {
    if (i > 0 && (c.group ?? "") !== (columns[i - 1].group ?? "")) gi++;
    xs[i] = n === 1 ? (startX + plotRight) / 2 : startX + i * step + gi * gap;
  });

  const yAt = (v: number) => plotBottom - ((v - 1) / 9) * (plotBottom - plotTop);

  const activeId = hover?.id ?? highlightId;
  const anyActive = !!activeId;

  function onMove(e: React.MouseEvent, s: ChartSeries) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHover({ id: s.id, name: s.name, color: s.color, x, y, flip: x > rect.width - 160 });
  }

  return (
    <div className="eval-chart" ref={wrapRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Ratings across items, one line per evaluation set"
        onMouseLeave={() => setHover(null)}
      >
        {/* Category separators (grouping aids, not value gridlines) */}
        {hasGroups &&
          groups.slice(0, -1).map((g, i) => {
            const sepX = (xs[g.last] + xs[groups[i + 1].first]) / 2;
            return (
              <line key={`sep-${i}`} x1={sepX} x2={sepX} y1={34} y2={axisY} stroke="var(--border)" strokeWidth={1} />
            );
          })}

        {/* Category labels */}
        {hasGroups &&
          groups.map((g) => (
            <text key={`cat-${g.group}`} x={(xs[g.first] + xs[g.last]) / 2} y={30} textAnchor="middle" className="eval-cat">
              {g.group}
            </text>
          ))}

        {/* Y labels 1–10, no gridlines */}
        {Array.from({ length: 10 }, (_, k) => k + 1).map((v) => (
          <text key={v} x={26} y={yAt(v) + 3} textAnchor="end" className="eval-axis">
            {v}
          </text>
        ))}

        {/* X baseline */}
        <line x1={32} x2={W - 10} y1={axisY} y2={axisY} stroke="var(--border-strong)" strokeWidth={1} />

        {/* One dashed line per series */}
        {series.map((s) => {
          const pts: { x: number; y: number }[] = [];
          columns.forEach((c, i) => {
            const v = s.values[c.key];
            if (typeof v === "number") pts.push({ x: xs[i], y: yAt(v) });
          });
          if (pts.length === 0) return null;
          const dim = anyActive && s.id !== activeId;
          const emphasized = anyActive && s.id === activeId;
          const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
          return (
            <g
              key={s.id}
              opacity={dim ? 0.2 : 1}
              style={{ cursor: "pointer" }}
              onMouseMove={(e) => onMove(e, s)}
              onMouseEnter={(e) => onMove(e, s)}
              onMouseLeave={() => setHover(null)}
            >
              <path d={d} fill="none" stroke="transparent" strokeWidth={10} style={{ pointerEvents: "stroke" }} />
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={emphasized ? 3 : 2}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ pointerEvents: "none" }}
              />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={emphasized ? 4 : 3} fill={s.color} />
              ))}
            </g>
          );
        })}

        {/* X labels, rotated */}
        {columns.map((c, i) => {
          const label = c.label.length > 16 ? c.label.slice(0, 15) + "…" : c.label;
          return (
            <text
              key={c.key}
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
          <span aria-hidden style={{ width: 12, height: 3, borderRadius: 2, background: hover.color, display: "inline-block" }} />
          {hover.name}
        </div>
      )}
    </div>
  );
}
