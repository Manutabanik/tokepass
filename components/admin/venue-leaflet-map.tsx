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

export type VenueCoordinates = {
  latitude: number
  longitude: number
}

/** Default: Obelisco, CABA */
export const VENUE_MAP_DEFAULT: VenueCoordinates = {
  latitude: -34.6037,
  longitude: -58.3816,
}

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

function FlyToCoordinates({
  coordinates,
  zoom,
}: {
  coordinates: VenueCoordinates
  zoom: number
}) {
  const map = useMap()

  useEffect(() => {
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

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={coordinates ? Math.max(zoom, 15) : 12}
      scrollWheelZoom
      className="h-full w-full bg-zinc-950 [&_.leaflet-control-attribution]:bg-black/50 [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:text-zinc-400"
    >
      {/* CartoDB Dark Matter — alinea con el panel oscuro Tokepass */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />
      <FlyToCoordinates
        coordinates={center}
        zoom={coordinates ? Math.max(zoom, 15) : 12}
      />
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

/**
 * Deep link al frontend del asistente (Google Maps / apps nativas).
 * Usá las coordenadas guardadas del recinto:
 *   googleMapsDeepLink(lat, lng) → abre la ubicación exacta
 */
export function googleMapsDeepLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
