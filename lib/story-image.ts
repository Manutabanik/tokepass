/** Same-origin proxy so html-to-image / Web Share can fetch storage URLs. */

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
  return `/api/story-image?url=${encodeURIComponent(trimmed)}`
}
