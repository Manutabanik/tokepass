/**
 * Debe coincidir con `extractNextStaticUrls` en `public/sw.js`.
 * No uses `[^"'\\s>]` en un regex literal: `\\s` excluye la letra "s"
 * y corta `/_next/static/chunks/...` en `/_next/static/chunk`.
 */
export const NEXT_STATIC_ASSET_RE =
  /\/_next\/static\/[a-zA-Z0-9/_.,%-]+\.(?:js|css|woff2|woff|png|svg|webp)(?:\?[^"' \t\n\r>]*)?/g

export function extractNextStaticUrls(html: string): string[] {
  return [...new Set(html.match(NEXT_STATIC_ASSET_RE) ?? [])]
}
