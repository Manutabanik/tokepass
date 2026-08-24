export const SANDBOX_BANNER_TEXT =
  "MODO DE PRUEBA: El evento no es público. Las compras son simuladas."

export const TEST_TICKET_WATERMARK = "TICKET DE PRUEBA - SIN VALIDEZ COMERCIAL"

export const TEST_TICKET_SCAN_DENIED = "TICKET DE PRUEBA - ACCESO DENEGADO"

const PREVIEW_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizePreviewKey(
  value: string | string[] | null | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const key = raw?.trim() ?? ""
  if (!PREVIEW_KEY_RE.test(key)) return null
  return key.toLowerCase()
}

export function publicEventPreviewPath(
  event: { slug?: string | null; id: string },
  previewKey: string,
): string {
  const slug = event.slug?.trim() || event.id
  return `/eventos/${slug}?preview=true&preview_key=${encodeURIComponent(previewKey)}`
}

/** URL de previsualización para el organizador (borrador o publicado). */
export function organizerPreviewOpenUrl(input: {
  slug?: string | null
  id: string
  previewKey?: string | null
  published?: boolean
}): string {
  const slug = input.slug?.trim() || input.id
  if (input.published) {
    return `/eventos/${slug}?preview=true`
  }
  const key = input.previewKey?.trim()
  if (key) {
    return `/eventos/${slug}?preview=true&preview_key=${encodeURIComponent(key)}`
  }
  return `/eventos/${slug}?preview=true`
}

export function withPreviewKey(
  path: string,
  previewKey: string | null,
): string {
  if (!previewKey) return path
  const join = path.includes("?") ? "&" : "?"
  return `${path}${join}preview_key=${encodeURIComponent(previewKey)}`
}
