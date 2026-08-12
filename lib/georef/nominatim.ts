/**
 * Nominatim (OpenStreetMap) — geocoding gratuito.
 * Política de uso: https://operations.osmfoundation.org/policies/nominatim/
 * Debounce + User-Agent identificable; no más de ~1 req/s.
 */

export type NominatimResult = {
  placeId: string
  displayName: string
  lat: number
  lng: number
}

type NominatimRaw = {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

export async function searchNominatimArgentina(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<NominatimResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []

  const params = new URLSearchParams({
    format: "json",
    q: trimmed,
    countrycodes: "ar",
    limit: String(options?.limit ?? 5),
    addressdetails: "0",
  })

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      signal: options?.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "es-AR,es;q=0.9",
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Nominatim HTTP ${response.status}`)
  }

  const rows = (await response.json()) as NominatimRaw[]
  return rows
    .map((row) => {
      const lat = Number(row.lat)
      const lng = Number(row.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      return {
        placeId: String(row.place_id),
        displayName: row.display_name,
        lat,
        lng,
      } satisfies NominatimResult
    })
    .filter((row): row is NominatimResult => row != null)
}
