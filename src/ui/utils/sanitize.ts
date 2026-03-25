import DOMPurify from "dompurify"

/** Sanitize HTML for safe use with dangerouslySetInnerHTML. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html)
}
