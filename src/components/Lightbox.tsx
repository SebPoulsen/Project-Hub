"use client";

import { useEffect } from "react";
import { useScrollLock } from "@/lib/useScrollLock";

/**
 * Full-resolution image modal. Inline note images are constrained for layout
 * (see globals.css); clicking one opens it here at native size. Display-only —
 * the source file in attachments/ is never resized.
 */
export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      {/* Stop propagation so clicking the image itself doesn't close. */}
      <img src={src} alt={alt ?? ""} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
