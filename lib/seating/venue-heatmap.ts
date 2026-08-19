import { isSellableElement, type InteractiveVenueMap } from "@/types/venue-map"

export type HeatmapRange = { min: number; max: number }

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}

/** Green (cheap) → yellow → red (expensive). */
export function heatmapColor(price: number, range: HeatmapRange): string {
  const { min, max } = range
  if (!(max > min)) return rgb(56, 189, 248)
  const t = Math.min(1, Math.max(0, (price - min) / (max - min)))
  if (t < 0.5) {
    const u = t * 2
    return rgb(lerp(34, 234, u), lerp(197, 179, u), lerp(94, 8, u))
  }
  const u = (t - 0.5) * 2
  return rgb(lerp(234, 239, u), lerp(179, 68, u), lerp(8, 68, u))
}

export function venueMapPriceRange(map: InteractiveVenueMap): HeatmapRange {
  const prices: number[] = []
  for (const sector of map.sectors) prices.push(Math.max(0, sector.price))
  for (const zone of map.zones ?? []) prices.push(Math.max(0, zone.price))
  for (const element of map.elements ?? []) {
    if (!isSellableElement(element)) continue
    prices.push(Math.max(0, element.price))
  }
  if (prices.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

export function applyHeatmapColors(map: InteractiveVenueMap): InteractiveVenueMap {
  const range = venueMapPriceRange(map)
  return {
    ...map,
    sectors: map.sectors.map((sector) => ({
      ...sector,
      color: heatmapColor(sector.price, range),
    })),
    zones: (map.zones ?? []).map((zone) => ({
      ...zone,
      color: heatmapColor(zone.price, range),
    })),
    elements: (map.elements ?? []).map((element) =>
      isSellableElement(element)
        ? { ...element, color: heatmapColor(element.price, range) }
        : { ...element, opacity: Math.min(element.opacity ?? 1, 0.35) },
    ),
  }
}
