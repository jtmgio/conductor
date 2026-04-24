const ALLOWED_TAGS = new Set([
  "p", "strong", "em", "b", "i", "u",
  "ul", "ol", "li", "br",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "code", "pre",
]);

export function sanitizeHtml(html: string): string {
  // Strip all tags not in allowlist, remove all attributes from allowed tags
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tag) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return "";
    // Rebuild tag without attributes
    if (match.startsWith("</")) return `</${lower}>`;
    if (match.endsWith("/>")) return `<${lower} />`;
    return `<${lower}>`;
  });
}
