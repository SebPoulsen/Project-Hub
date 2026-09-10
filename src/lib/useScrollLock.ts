import { useEffect } from "react";

/**
 * Lock background page scroll while an overlay is open, restoring the previous
 * value on close. Extracted from the photo lightbox so the calendar day-popover
 * (and any future overlay) reuses the exact same approach.
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
