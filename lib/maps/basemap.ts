/**
 * Same-origin basemap URL. Path is style-versioned so CDN/browser caches of a
 * previous basemap (e.g. Carto dark_all) never mix with the current style.
 */
export const TOKEPASS_BASEMAP_URL = "/api/map-tiles/voyager/{z}/{x}/{y}"

export const TOKEPASS_BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
