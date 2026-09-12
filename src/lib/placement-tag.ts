/**
 * Optional within-project placement tag applied to to-dos, notes, reflections,
 * and companies — associating an entry with the user's primary/secondary
 * placement (or both). Distinct from the project-level placement *metadata* in
 * lib/placement.ts. Pure module (no node deps) so client components can import.
 */
export type PlacementTag = "primary" | "secondary" | "both";

export const PLACEMENT_TAGS: { value: PlacementTag; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "both", label: "Both" },
];

export const PLACEMENT_LABEL: Record<PlacementTag, string> = {
  primary: "Primary",
  secondary: "Secondary",
  both: "Both",
};

/** Coerce an arbitrary value into a valid tag, or null (unset). */
export function normalizePlacementTag(v: unknown): PlacementTag | null {
  return v === "primary" || v === "secondary" || v === "both" ? v : null;
}

export type PlacementFilterValue = "all" | PlacementTag;

/**
 * Filter match. Filtering by primary/secondary also matches entries tagged
 * "both" (they apply to that placement too); "both" matches only exactly-both;
 * "all" matches everything including unset.
 */
export function placementMatches(
  tag: PlacementTag | null | undefined,
  filter: PlacementFilterValue
): boolean {
  if (filter === "all") return true;
  if (filter === "both") return tag === "both";
  return tag === filter || tag === "both";
}
