"use client"

import { MapPinned } from "lucide-react"

import { TOKEPASS_BASEMAP_URL } from "@/lib/maps/basemap"

const TILE_ZOOM = 15
const TILE_PX = 256

function lonToTile(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom)
}

function latToTile(lat: number, zoom: number) {
  const rad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      2 ** zoom,
  )
}

function tileSrc(x: number, y: number) {
  const max = 2 ** TILE_ZOOM
  const wrappedX = ((x % max) + max) % max
  const clampedY = Math.min(max - 1, Math.max(0, y))
  return TOKEPASS_BASEMAP_URL.replace("{z}", String(TILE_ZOOM))
    .replace("{x}", String(wrappedX))
    .replace("{y}", String(clampedY))
}

/**
 * Static preview (no Leaflet). react-leaflet's MapContainer + invalidateSize
 * can hit React #185 (max update depth) on the public event page.
 */
export function EventLocationMapInner({
  latitude,
  longitude,
}: {
  latitude: number
  longitude: number
}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
        Mapa no disponible
      </div>
    )
  }

  const originX = lonToTile(longitude, TILE_ZOOM)
  const originY = latToTile(latitude, TILE_ZOOM)
  const tiles = [-1, 0, 1].flatMap((dx) =>
    [-1, 0, 1].map((dy) => ({
      key: `${dx}:${dy}`,
      src: tileSrc(originX + dx, originY + dy),
    })),
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#e8e4dc]">
      <div
        className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 grid-cols-3"
        style={{ width: TILE_PX * 3, height: TILE_PX * 3 }}
      >
        {tiles.map((tile) => (
          // Tile proxy is same-origin; next/image is unnecessary for this mosaic.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            width={TILE_PX}
            height={TILE_PX}
            draggable={false}
            className="size-[256px] max-w-none select-none"
          />
        ))}
      </div>
      <span className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-[70%] flex-col items-center">
        <span className="grid size-10 place-items-center rounded-full bg-emerald-500 text-zinc-950 shadow-[0_0_0_8px_rgba(16,185,129,0.2)]">
          <MapPinned className="size-5" aria-hidden="true" />
        </span>
      </span>
    </div>
  )
}
