import type { InteractiveVenueMap } from "@/types/venue-map"

const CANVAS = { width: 800, height: 560 }

export function VenueMapBackgroundLayer({
  map,
}: {
  map: InteractiveVenueMap
}) {
  if (!map.backgroundImage) return null
  const scale = map.backgroundScale || 1
  const width = CANVAS.width * scale
  const height = CANVAS.height * scale
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
    />
  )
}
