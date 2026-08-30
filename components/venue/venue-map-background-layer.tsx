import type { InteractiveVenueMap } from "@/types/venue-map"
import { VENUE_MAP_CANVAS } from "@/lib/seating/venue-polygon"

export function VenueMapBackgroundLayer({
  map,
}: {
  map: InteractiveVenueMap
}) {
  if (!map?.backgroundImage) return null
  const scale = map.backgroundScale || 1
  const width = VENUE_MAP_CANVAS.width * scale
  const height = VENUE_MAP_CANVAS.height * scale
  return (
    <image
      href={map.backgroundImage}
      x={map.backgroundX || 0}
      y={map.backgroundY || 0}
      width={width}
      height={height}
      opacity={map.backgroundOpacity ?? 0.4}
      preserveAspectRatio="xMidYMid meet"
      pointerEvents="none"
      className="pointer-events-none"
    />
  )
}
