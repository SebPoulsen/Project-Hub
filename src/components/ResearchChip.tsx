"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * A research-question tag chip (the ◈ chips on note cards and the note modal).
 * Sub-question tags carry a composed `Parent ↳ Sub-question` label that can run
 * long, so the visible text is truncated to a fixed length while the FULL text
 * stays available on hover (native `title` tooltip) — and, for the non-link
 * card variant, on tap (click toggles the full text without navigating).
 *
 * Pass `href` to keep the existing click-through (the note modal links to
 * /research); omit it for a plain, non-navigating chip (the note cards), which
 * then reveals its full label on click.
 */
const MAX_CHARS = 46;

function truncate(s: string): string {
  const t = s.trim();
  return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS - 1).trimEnd() + "…" : t;
}

export function ResearchChip({
  label,
  href,
}: {
  label: string;
  href?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const short = truncate(label);
  const truncated = short !== label;

  // Link variant: click-through is unchanged; tooltip carries the full text.
  if (href) {
    return (
      <Link href={href} className="chip chip-research" title={label}>
        ◈ {short}
      </Link>
    );
  }

  // Plain variant: hover shows the full text; if truncated, a tap toggles it
  // fully visible in place (no navigation).
  return (
    <span
      className={`chip chip-research${expanded ? " chip-research-full" : ""}`}
      title={label}
      role={truncated ? "button" : undefined}
      tabIndex={truncated ? 0 : undefined}
      style={truncated ? { cursor: "pointer" } : undefined}
      onClick={
        truncated
          ? (e) => {
              // The chip may sit inside a clickable card (note cards open the
              // reading modal on click) — stop the bubble so a tap reveals the
              // full label in place instead of navigating.
              e.stopPropagation();
              setExpanded((v) => !v);
            }
          : undefined
      }
      onKeyDown={
        truncated
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setExpanded((v) => !v);
              }
            }
          : undefined
      }
    >
      ◈ {expanded ? label : short}
    </span>
  );
}
