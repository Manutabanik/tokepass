/**
 * Same-origin basemap URL. Tiles are proxied by /api/map-tiles so the browser
 * never depends on third-party img-src / ad-block / referrer quirks.
 */
export const TOKEPASS_BASEMAP_URL = "/api/map-tiles/{z}/{x}/{y}"

export const TOKEPASS_BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
