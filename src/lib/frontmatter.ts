import matter from "gray-matter";

/**
 * Build a Markdown-with-frontmatter file from a frontmatter object plus a body
 * string, with every frontmatter value safely quoted/escaped by the YAML
 * serializer (js-yaml, via gray-matter).
 *
 * This replaces hand-built `key: ${value}` templates, which produced invalid or
 * mis-parsed YAML whenever a value contained a metacharacter — a leading
 * `[ { > * ! @ -`, a `: ` (colon-space), a ` #`, or a tag with `, ] : {` — and
 * could make an entry (and, via the list loops, the whole page) fail to load.
 *
 * Field order follows the object's key order. Keep the app's file convention:
 * a blank line between the closing `---` and the body, and a trailing newline.
 * Omit optional fields (e.g. a null placement) by leaving them off the object.
 */
export function toMarkdown(
  data: Record<string, unknown>,
  body: string
): string {
  const trimmed = body.trim();
  // Leading "\n" so the body starts one blank line below the frontmatter.
  return matter.stringify(trimmed ? `\n${trimmed}\n` : "\n", data);
}
