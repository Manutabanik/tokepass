/** Parseo y validación de spots YouTube / Vimeo (sin Storage). */

export type PromoVideoProvider = "youtube" | "vimeo"

export type ParsedPromoVideo = {
  provider: PromoVideoProvider
  id: string
  /** URL canónica limpia para persistir. */
  canonicalUrl: string
  /** Embed URL listo para iframe (cargar solo al abrir el modal). */
  embedUrl: string
}

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i

const VIMEO_RE =
  /(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d{6,})/i

export function parsePromoVideoUrl(
  raw: string | null | undefined,
): ParsedPromoVideo | null {
  const input = raw?.trim() ?? ""
  if (!input) return null

  let url: URL
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`)
  } catch {
    return null
  }

  const href = url.href

  const yt = href.match(YOUTUBE_RE)
  if (yt?.[1]) {
    const id = yt[1]
    return {
      provider: "youtube",
      id,
      canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
    }
  }

  const vimeo = href.match(VIMEO_RE)
  if (vimeo?.[1]) {
    const id = vimeo[1]
    return {
      provider: "vimeo",
      id,
      canonicalUrl: `https://vimeo.com/${id}`,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
    }
  }

  return null
}

export function isValidPromoVideoUrl(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim() ?? ""
  if (!trimmed) return true
  return parsePromoVideoUrl(trimmed) != null
}
