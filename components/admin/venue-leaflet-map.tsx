"use client"

import { divIcon, type Marker as LeafletMarker } from "leaflet"
import { useEffect } from "react"
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

/** Recompute tile layout after dynamic mount / tab reveal. */
function MapSizeFix() {
  const map = useMap()

  useEffect(() => {
    const run = () => map.invalidateSize({ pan: false })
    run()
    const t1 = window.setTimeout(run, 80)
    const t2 = window.setTimeout(run, 300)
    window.addEventListener("resize", run)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
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

  useEffect(() => {
    map.invalidateSize({ pan: false })
    map.flyTo([coordinates.latitude, coordinates.longitude], zoom, {
      animate: true,
      duration: 0.85,
    })
  }, [coordinates.latitude, coordinates.longitude, map, zoom])

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
  const center = coordinates ?? VENUE_MAP_DEFAULT
  const mapZoom = coordinates ? Math.max(zoom, 15) : 12

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={mapZoom}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", minHeight: 300 }}
      className="tokepass-leaflet-map h-full w-full bg-zinc-950 [&_.leaflet-control-attribution]:bg-black/50 [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:text-zinc-400"
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
      {coordinates ? (
        <Marker
          position={[coordinates.latitude, coordinates.longitude]}
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
