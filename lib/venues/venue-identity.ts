/** Placeholder que `coerceDraftEventForm` usa cuando el recinto aún no tiene nombre. */
export const DRAFT_PLACEHOLDER_VENUE_NAME = "Por definir"

export function normalizeExactVenueName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim()
}

export function isDraftPlaceholderVenueName(
  name: string | null | undefined,
): boolean {
  return (
    normalizeExactVenueName(name).toLocaleLowerCase("es") ===
    DRAFT_PLACEHOLDER_VENUE_NAME.toLocaleLowerCase("es")
  )
}

export function canPersistCatalogVenueName(
  name: string | null | undefined,
): boolean {
  const normalized = normalizeExactVenueName(name)
  return normalized.length >= 2 && !isDraftPlaceholderVenueName(normalized)
}
