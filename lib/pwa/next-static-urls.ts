/**
 * Extrae assets reales de Next desde HTML.
 * Nunca uses `[^"'\\s>]` en un regex literal: `\\s` excluye la letra "s"
 * y corta `/_next/static/chunks/...` en `/_next/static/chunk`,
 * y `/media/797e433ab948586e-s.p.woff2` en `/media/797e433ab948586e-`.
 *
 * El service worker ya no precachea estos paths (v10+). Esta helper
 * queda para tests y para no reintroducir el character class roto.
 */
const NEXT_STATIC_EXTENSIONS = "js|css|woff2|woff|png|svg|webp"

export const NEXT_STATIC_ASSET_RE = new RegExp(
  String.raw`/_next/static/(?:[A-Za-z0-9/_-]+/)*[A-Za-z0-9._-]+\.(?:${NEXT_STATIC_EXTENSIONS})(?:\?[^"' \t\n\r>]*)?`,
  "g",
)

export function isCompleteNextStaticUrl(value: string): boolean {
  if (!value.startsWith("/_next/static/")) return false
  if (value === "/_next/static/chunk" || value.includes("/_next/static/chunk?")) {
    return false
  }
  if (value.endsWith("-") || value.endsWith("/")) return false
  const path = value.split("?")[0] ?? value
  return new RegExp(
    String.raw`^/_next/static/(?:[A-Za-z0-9/_-]+/)*[A-Za-z0-9._-]+\.(?:${NEXT_STATIC_EXTENSIONS})$`,
  ).test(path)
}

export function extractNextStaticUrls(html: string): string[] {
  return [...new Set(html.match(NEXT_STATIC_ASSET_RE) ?? [])].filter(
    isCompleteNextStaticUrl,
  )
}
