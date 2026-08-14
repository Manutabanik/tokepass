/** Parseo y embeds de spots promocionales (YouTube, Vimeo, archivo directo). */

export type PromoVideoProvider = "youtube" | "vimeo" | "file"

export type ParsedPromoVideo = {
  provider: PromoVideoProvider
  id: string
  /** URL canónica limpia para persistir. */
  canonicalUrl: string
  /**
   * YouTube/Vimeo: URL de iframe.
   * file: URL directa para `<video src>`.
   */
  embedUrl: string
}

export type EmbedUrlResult = {
  type: PromoVideoProvider | null
  /** URL lista para iframe o `<video>`. */
  embedUrl: string | null
  canonicalUrl: string | null
  id: string | null
}

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{6,})/i

const VIMEO_RE =
  /(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d{6,})/i

const DIRECT_EXT_RE = /\.(mp4|webm|ogg|ogv|m4v|mov)(?:$|[?#])/i

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`)
  } catch {
    return null
  }
}

function isDirectVideoUrl(url: URL): boolean {
  if (DIRECT_EXT_RE.test(url.pathname) || DIRECT_EXT_RE.test(url.href)) {
    return true
  }

  const host = url.hostname.toLowerCase()

  // Cloudinary video delivery
  if (host.includes("cloudinary.com") && /\/video\//i.test(url.pathname)) {
    return true
  }

  // Supabase Storage (object público o signed)
  if (
    (host.includes("supabase.co") || host.includes("supabase.in")) &&
    /\/storage\/v1\/object\//i.test(url.pathname) &&
    DIRECT_EXT_RE.test(url.pathname + url.search)
  ) {
    return true
  }

  // Mux / Cloudflare Stream progressive, etc. con extensión en query path
  if (DIRECT_EXT_RE.test(url.search)) {
    return true
  }

  return false
}

/**
 * Convierte cualquier URL de video al formato embebible o directo.
 * Preferí esta API en UI nuevas; `parsePromoVideoUrl` sigue disponible.
 */
export function getEmbedUrl(url: string | null | undefined): EmbedUrlResult {
  const input = url?.trim() ?? ""
  if (!input) {
    return { type: null, embedUrl: null, canonicalUrl: null, id: null }
  }

  const parsed = tryParseUrl(input)
  if (!parsed) {
    return { type: null, embedUrl: null, canonicalUrl: null, id: null }
  }

  const href = parsed.href

  const yt = href.match(YOUTUBE_RE)
  if (yt?.[1]) {
    const id = yt[1]
    return {
      type: "youtube",
      id,
      canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&muted=1&enablejsapi=1&rel=0&playsinline=1&modestbranding=1`,
    }
  }

  const vimeo = href.match(VIMEO_RE)
  if (vimeo?.[1]) {
    const id = vimeo[1]
    return {
      type: "vimeo",
      id,
      canonicalUrl: `https://vimeo.com/${id}`,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&background=0`,
    }
  }

  if (isDirectVideoUrl(parsed)) {
    const canonical = parsed.href
    return {
      type: "file",
      id: "file",
      canonicalUrl: canonical,
      embedUrl: canonical,
    }
  }

  return { type: null, embedUrl: null, canonicalUrl: null, id: null }
}

export function parsePromoVideoUrl(
  raw: string | null | undefined,
): ParsedPromoVideo | null {
  const result = getEmbedUrl(raw)
  if (!result.type || !result.embedUrl || !result.canonicalUrl || !result.id) {
    return null
  }
  return {
    provider: result.type,
    id: result.id,
    canonicalUrl: result.canonicalUrl,
    embedUrl: result.embedUrl,
  }
}

export function isValidPromoVideoUrl(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim() ?? ""
  if (!trimmed) return true
  return getEmbedUrl(trimmed).type != null
}
