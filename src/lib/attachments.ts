/**
 * Shared helpers for entry attachments (images + PDFs) stored under a project's
 * `attachments/` folder and served by /api/attachments/[project]/[file].
 *
 * Attachments are referenced by plain filename in an entry's frontmatter
 * `attachments:` list. Every file is stored once and named with the owning
 * entry's id as a prefix, so a given attachment belongs to exactly one entry.
 */

const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|heic)$/i;
const PDF_RE = /\.pdf$/i;

export function isImageAttachment(file: string): boolean {
  return IMAGE_RE.test(file);
}

export function isPdfAttachment(file: string): boolean {
  return PDF_RE.test(file);
}

/** Split an attachment list into images and PDFs, preserving order. */
export function splitAttachments(files: string[] = []): {
  images: string[];
  pdfs: string[];
} {
  return {
    images: files.filter(isImageAttachment),
    pdfs: files.filter(isPdfAttachment),
  };
}

/** URL that serves an attachment's bytes (image inline, PDF inline). */
export function attachmentUrl(project: string, file: string): string {
  return `/api/attachments/${encodeURIComponent(project)}/${encodeURIComponent(
    file
  )}`;
}

/**
 * Human-readable label for a stored attachment. Stored names are
 * `<entryId>-<originalName>` (e.g. `2026-09-28-note-with-pdf-Report.pdf`); the
 * id prefix is noise to a reader. When the owning entry's id is known we strip
 * exactly that prefix (recovering the original name, or a `2-` dedup marker);
 * otherwise we fall back to dropping a leading `YYYY-MM-DD-…-` heuristically.
 */
export function attachmentLabel(file: string, entryId?: string): string {
  if (entryId && file.startsWith(`${entryId}-`)) {
    return file.slice(entryId.length + 1);
  }
  const m = file.match(/^\d{4}-\d{2}-\d{2}-.*?-(.+)$/);
  return m ? m[1] : file;
}
