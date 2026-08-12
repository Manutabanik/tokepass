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

/**
 * Deep link a Google Maps / apps nativas.
 *   googleMapsDeepLink(lat, lng) → ubicación exacta
 */
export function googleMapsDeepLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
