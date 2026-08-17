"use client"

import {
  divIcon,
  type Map as LeafletMap,
  type Marker as LeafletMarker,
} from "leaflet"
import { useEffect, useRef } from "react"
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"

import {
  TOKEPASS_BASEMAP_ATTRIBUTION,
  TOKEPASS_BASEMAP_URL,
} from "@/lib/maps/basemap"
import {
  isFiniteVenueCoordinates,
  VENUE_MAP_DEFAULT,
  type VenueCoordinates,
} from "@/lib/seating/venue-geo"

export type { VenueCoordinates }
export { VENUE_MAP_DEFAULT, googleMapsDeepLink } from "@/lib/seating/venue-geo"

const markerIcon = divIcon({
  className: "tokepass-map-marker",
  html: `
    <span style="
      display:grid;place-items:center;width:36px;height:36px;
      border-radius:12px 12px 12px 3px;transform:rotate(-45deg);
      background:#10b981;border:3px solid #ecfdf5;
      box-shadow:0 0 28px rgba(16,185,129,.55)
    "><span style="
      width:10px;height:10px;border-radius:999px;background:#052e25
    "></span></span>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
})

function mapHasUsableSize(map: LeafletMap) {
  const size = map.getSize()
  return size.x >= 2 && size.y >= 2
}

function mapCenterIsFinite(map: LeafletMap) {
  try {
    const center = map.getCenter()
    return Number.isFinite(center.lat) && Number.isFinite(center.lng)
  } catch {
    return false
  }
}

/** Recompute tile layout after dynamic mount / tab reveal. */
function MapSizeFix() {
  const map = useMap()

  useEffect(() => {
    const run = () => {
      if (!mapHasUsableSize(map)) {
        map.stop()
        return
      }
      map.invalidateSize({ pan: false, animate: false })
    }
    run()
    const container = map.getContainer()
    const observer = new ResizeObserver(run)
    observer.observe(container)
    window.addEventListener("resize", run)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", run)
    }
  }, [map])

  return null
}

function FlyToCoordinates({
  coordinates,
  zoom,
}: {
  coordinates: VenueCoordinates
  zoom: number
}) {
  const map = useMap()
  const hasSettledRef = useRef(false)

  useEffect(() => {
    if (!isFiniteVenueCoordinates(coordinates) || !Number.isFinite(zoom)) {
      return
    }

    const apply = () => {
      if (!mapHasUsableSize(map)) return false
      map.invalidateSize({ pan: false, animate: false })
      if (!mapHasUsableSize(map)) return false

      const latlng: [number, number] = [
        coordinates.latitude,
        coordinates.longitude,
      ]
      if (mapCenterIsFinite(map)) {
        const current = map.getCenter()
        if (
          Math.abs(current.lat - coordinates.latitude) < 1e-7 &&
          Math.abs(current.lng - coordinates.longitude) < 1e-7 &&
          map.getZoom() === zoom
        ) {
          hasSettledRef.current = true
          return true
        }
      }
      map.stop()

      const canAnimate = hasSettledRef.current && mapCenterIsFinite(map)
      try {
        if (canAnimate) {
          map.flyTo(latlng, zoom, { animate: true, duration: 0.85 })
        } else {
          map.setView(latlng, zoom, { animate: false })
        }
        hasSettledRef.current = true
        return true
      } catch {
        try {
          map.setView(latlng, zoom, { animate: false })
          hasSettledRef.current = true
          return true
        } catch {
          return false
        }
      }
    }

    if (apply()) return

    const observer = new ResizeObserver(() => {
      if (apply()) observer.disconnect()
    })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [coordinates, map, zoom])

  return null
}

function MapClickHandler({
  onChange,
}: {
  onChange: (coordinates: VenueCoordinates) => void
}) {
  useMapEvents({
    click(event) {
      onChange({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      })
    },
  })
  return null
}

export function VenueLeafletMap({
  coordinates,
  onChange,
  zoom = 12,
}: {
  coordinates: VenueCoordinates | null
  onChange: (coordinates: VenueCoordinates) => void
  zoom?: number
}) {
  const pinned = isFiniteVenueCoordinates(coordinates) ? coordinates : null
  const center = pinned ?? VENUE_MAP_DEFAULT
  const mapZoom = pinned ? Math.max(Number.isFinite(zoom) ? zoom : 15, 15) : 12

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={mapZoom}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", minHeight: 300 }}
      className="tokepass-leaflet-map h-full w-full bg-[#e8e4dc] [&_.leaflet-control-attribution]:bg-white/80 [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:text-zinc-600"
    >
      <MapSizeFix />
      <TileLayer
        attribution={TOKEPASS_BASEMAP_ATTRIBUTION}
        url={TOKEPASS_BASEMAP_URL}
        maxZoom={20}
        tileSize={256}
        zoomOffset={0}
      />
      <FlyToCoordinates coordinates={center} zoom={mapZoom} />
      <MapClickHandler onChange={onChange} />
      {pinned ? (
        <Marker
          position={[pinned.latitude, pinned.longitude]}
          icon={markerIcon}
          draggable
          eventHandlers={{
            dragend(event) {
              const marker = event.target as LeafletMarker
              const next = marker.getLatLng()
              onChange({
                latitude: next.lat,
                longitude: next.lng,
              })
            },
          }}
        />
      ) : null}
    </MapContainer>
  )
}
