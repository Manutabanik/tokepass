export function decodeEventParam(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

export function eventSlugSuffix(slug: string): string | null {
  const match = slug.trim().toLowerCase().match(/-([a-f0-9]{8})$/)
  return match?.[1] ?? null
}

export function uuidPrefixFromSlugSuffix(suffix: string): string {
  return `${suffix.toLowerCase()}-%`
}
