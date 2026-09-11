/**
 * Placement types + pure helpers. Kept in their own module (no node/fs imports)
 * so client components can import them without pulling server-only code into the
 * browser bundle. lib/projects.ts re-exports these for server-side callers.
 */
export interface PlacementInfo {
  organisation: string;
  location: string;
  supervisor: string;
  contactEmail: string;
  focus: string;
  startDate: string | null;
  endDate: string | null;
}

export interface Placement {
  primary: PlacementInfo;
  secondary: PlacementInfo;
}

export function emptyPlacementInfo(): PlacementInfo {
  return {
    organisation: "",
    location: "",
    supervisor: "",
    contactEmail: "",
    focus: "",
    startDate: null,
    endDate: null,
  };
}

export function emptyPlacement(): Placement {
  return { primary: emptyPlacementInfo(), secondary: emptyPlacementInfo() };
}

/**
 * Coerce whatever is stored under `placement` into the structured shape. Pre–
 * Phase 2 projects stored primary/secondary as bare strings; those become the
 * `organisation` of the new object so nothing is lost.
 */
function normalizeSide(raw: unknown): PlacementInfo {
  const base = emptyPlacementInfo();
  if (typeof raw === "string") return { ...base, organisation: raw };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return {
      organisation: String(r.organisation ?? ""),
      location: String(r.location ?? ""),
      supervisor: String(r.supervisor ?? ""),
      contactEmail: String(r.contactEmail ?? ""),
      focus: String(r.focus ?? ""),
      startDate: r.startDate ? String(r.startDate).slice(0, 10) : null,
      endDate: r.endDate ? String(r.endDate).slice(0, 10) : null,
    };
  }
  return base;
}

export function normalizePlacement(raw: unknown): Placement {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    primary: normalizeSide(r.primary),
    secondary: normalizeSide(r.secondary),
  };
}
