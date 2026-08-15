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
  const trimmed = url?.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("data:image/")) return trimmed

  const endpoint = storyImageDataUrlEndpoint(trimmed)
  if (!endpoint) return null
  if (endpoint.startsWith("data:image/")) return endpoint

  if (!endpoint.includes("format=dataurl")) return null

  try {
    const response = await fetch(endpoint, { cache: "no-store" })
    if (!response.ok) return null
    const payload = (await response.json()) as { dataUrl?: unknown }
    const dataUrl =
      typeof payload.dataUrl === "string" ? payload.dataUrl.trim() : ""
    return dataUrl.startsWith("data:image/") ? dataUrl : null
  } catch {
    return null
  }
}

export async function hydrateStoryFlyerImages<
  T extends {
    imageUrl?: string | null
    artistImageUrl?: string | null
    organizerAvatarUrl?: string | null
  },
>(data: T): Promise<T> {
  const [imageUrl, artistImageUrl, organizerAvatarUrl] = await Promise.all([
    fetchStoryImageDataUrl(data.imageUrl),
    fetchStoryImageDataUrl(data.artistImageUrl),
    fetchStoryImageDataUrl(data.organizerAvatarUrl),
  ])
  return {
    ...data,
    imageUrl: imageUrl ?? data.imageUrl,
    artistImageUrl: artistImageUrl ?? data.artistImageUrl,
    organizerAvatarUrl: organizerAvatarUrl ?? data.organizerAvatarUrl,
  }
}
