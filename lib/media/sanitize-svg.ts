const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script>/gi
const SCRIPT_EMPTY = /<script\b[^>]*\/?>/gi
const EVENT_ATTR = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_URL = /(href|xlink:href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi

export function sanitizeSponsorSvg(raw: string): string | null {
  const text = raw.replace(/^\uFEFF/, "").trim()
  if (!text || !/<svg[\s>]/i.test(text)) return null

  const cleaned = text
    .replace(SCRIPT_BLOCK, "")
    .replace(SCRIPT_EMPTY, "")
    .replace(EVENT_ATTR, "")
    .replace(JS_URL, "$1=$2$2")

  if (/<script/i.test(cleaned) || !/<svg[\s>]/i.test(cleaned)) return null
  return cleaned
}
