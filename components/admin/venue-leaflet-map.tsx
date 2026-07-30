"use client"

import { divIcon, type Marker as LeafletMarker } from "leaflet"
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import { useEffect } from "react"

export type VenueCoordinates = {
  latitude: number
  longitude: number
}

const BUENOS_AIRES: VenueCoordinates = {
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

function RecenterMap({ coordinates }: { coordinates: VenueCoordinates }) {
  const map = useMap()

  useEffect(() => {
    map.setView([coordinates.latitude, coordinates.longitude], map.getZoom(), {
      animate: true,
    })
  }, [coordinates.latitude, coordinates.longitude, map])

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
}: {
  coordinates: VenueCoordinates | null
  onChange: (coordinates: VenueCoordinates) => void
}) {
  const center = coordinates ?? BUENOS_AIRES

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={coordinates ? 16 : 12}
      scrollWheelZoom
      className="h-full w-full bg-zinc-950"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <RecenterMap coordinates={center} />
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
