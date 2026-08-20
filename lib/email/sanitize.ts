const EMAIL_TITLE_MAX = 120

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function sanitizeEmailText(value: string, max = EMAIL_TITLE_MAX): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}

export function sanitizeEmailSubject(value: string, max = EMAIL_TITLE_MAX): string {
  return sanitizeEmailText(value, max)
}
