"use client";

import { attachmentUrl, attachmentLabel } from "@/lib/attachments";

/**
 * A row of attached-PDF links. Each opens the PDF in a new tab — the serving
 * route sends `application/pdf` inline, so the browser's built-in viewer shows
 * it (and can download from there). Pass `onRemove` in an editor to show a ×.
 *
 * Links stopPropagation so clicking one inside a clickable card doesn't also
 * trigger the card's open handler.
 */
export function PdfAttachments({
  project,
  files,
  entryId,
  onRemove,
}: {
  project: string;
  files: string[];
  /** Owning entry's id — lets the chip show the original filename. */
  entryId?: string;
  onRemove?: (file: string) => void;
}) {
  if (!files || files.length === 0) return null;
  return (
    <div className="pdf-list">
      {files.map((f) => (
        <span key={f} className="pdf-chip">
          <a
            className="pdf-chip-link"
            href={attachmentUrl(project, f)}
            target="_blank"
            rel="noopener noreferrer"
            title={attachmentLabel(f, entryId)}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="pdf-icon" aria-hidden="true">
              PDF
            </span>
            <span className="pdf-name">{attachmentLabel(f, entryId)}</span>
          </a>
          {onRemove && (
            <button
              type="button"
              className="pdf-remove"
              title="Remove this PDF"
              aria-label={`Remove ${attachmentLabel(f, entryId)}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(f);
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
