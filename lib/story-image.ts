/** Same-origin proxy so html-to-image can snapshot event flyers without CORS. */

const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\])$/i
const PRIVATE_IPV4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

export function parseStoryImageUrl(raw: string | null | undefined): URL | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/")
  ) {
    return null
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
    if (parsed.username || parsed.password) return null
    const host = parsed.hostname.toLowerCase()
    if (PRIVATE_HOST.test(host) || PRIVATE_IPV4.test(host)) return null
    if (host.endsWith(".local") || host.endsWith(".internal")) return null
    return parsed
  } catch {
    return null
  }
}

export function storyImageSrc(url: string | null | undefined): string | null {
  const trimmed = url?.trim()
  if (!trimmed) return null
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/")
  ) {
    return trimmed
  }
  if (!parseStoryImageUrl(trimmed)) return null
  return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`
}

/** URLs that html-to-image can snapshot without tainting the canvas. */
export function storySafeImageSrc(
  url: string | null | undefined,
): string | null {
  const trimmed = url?.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("data:image/")) return trimmed
  if (trimmed.startsWith("blob:")) return trimmed
  if (trimmed.startsWith("/api/proxy-image?")) return trimmed
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed
  return null
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (result.startsWith("data:")) {
        resolve(result)
        return
      }
      reject(new Error("invalid_data_url"))
    }
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"))
    reader.readAsDataURL(blob)
  })
}

/**
 * Convert a flyer URL to a local data URL so the story canvas is never tainted.
 * Uses the same-origin proxy — a direct browser fetch to Supabase/S3 fails CORS.
 */
export async function fetchImageAsBase64(
  imageUrl: string | null | undefined,
): Promise<string | null> {
  const trimmed = imageUrl?.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("data:image/")) return trimmed

  const proxy = storyImageSrc(trimmed)
  if (!proxy) return null
  if (proxy.startsWith("data:image/")) return proxy

  try {
    const response = await fetch(proxy, {
      mode: "cors",
      cache: "no-cache",
    })
    if (!response.ok) {
      return storySafeImageSrc(proxy)
    }
    const blob = await response.blob()
    return await blobToDataUrl(blob)
  } catch {
    return storySafeImageSrc(proxy)
  }
}

export function storyImageDataUrlEndpoint(
  url: string | null | undefined,
): string | null {
  const src = storyImageSrc(url)
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src
  if (src.startsWith("/api/proxy-image?")) return `${src}&format=dataurl`
  return src
}

export async function fetchStoryImageDataUrl(
  url: string | null | undefined,
): Promise<string | null> {
  return fetchImageAsBase64(url)
}

export async function hydrateStoryFlyerImages<
  T extends {
    imageUrl?: string | null
    artistImageUrl?: string | null
    organizerAvatarUrl?: string | null
    lineupArtists?: Array<{ name: string; imageUrl?: string | null }>
  },
>(data: T): Promise<T> {
  const lineup = data.lineupArtists ?? []
  const [imageUrl, artistImageUrl, organizerAvatarUrl, ...lineupImages] =
    await Promise.all([
      fetchImageAsBase64(data.imageUrl),
      fetchImageAsBase64(data.artistImageUrl),
      fetchImageAsBase64(data.organizerAvatarUrl),
      ...lineup.map((artist) => fetchImageAsBase64(artist.imageUrl)),
    ])
  return {
    ...data,
    imageUrl: imageUrl ?? storySafeImageSrc(data.imageUrl),
    artistImageUrl:
      artistImageUrl ?? storySafeImageSrc(data.artistImageUrl),
    organizerAvatarUrl:
      organizerAvatarUrl ?? storySafeImageSrc(data.organizerAvatarUrl),
    ...(lineup.length > 0
      ? {
          lineupArtists: lineup.map((artist, index) => ({
            ...artist,
            imageUrl:
              lineupImages[index] ??
              storySafeImageSrc(artist.imageUrl) ??
              null,
          })),
        }
      : {}),
  }
}
