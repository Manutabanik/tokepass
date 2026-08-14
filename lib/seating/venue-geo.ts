/** Coordenadas y helpers sin dependencias de Leaflet (seguro en SSR). */

export type VenueCoordinates = {
  latitude: number
  longitude: number
}

/** Default: Obelisco, CABA */
export const VENUE_MAP_DEFAULT: VenueCoordinates = {
  latitude: -34.6037,
  longitude: -58.3816,
}

export function isFiniteVenueCoordinates(
  value: VenueCoordinates | null | undefined,
): value is VenueCoordinates {
  return (
    value != null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  )
}

/**
 * Deep link a Google Maps / apps nativas.
 *   googleMapsDeepLink(lat, lng) → ubicación exacta
 */
export function googleMapsDeepLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
