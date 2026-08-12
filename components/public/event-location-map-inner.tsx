"use client"

import { divIcon } from "leaflet"
import { MapContainer, Marker, TileLayer } from "react-leaflet"

import "leaflet/dist/leaflet.css"

const markerIcon = divIcon({
  className: "tokepass-event-map-marker",
  html: `
    <span style="
      display:grid;place-items:center;width:34px;height:34px;
      border-radius:12px 12px 12px 3px;transform:rotate(-45deg);
      background:#10b981;border:3px solid #ecfdf5;
      box-shadow:0 0 24px rgba(16,185,129,.5)
    "><span style="
      width:9px;height:9px;border-radius:999px;background:#052e25
    "></span></span>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
})

export function EventLocationMapInner({
  latitude,
  longitude,
}: {
  latitude: number
  longitude: number
}) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={15}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      touchZoom={false}
      keyboard={false}
      className="h-full w-full bg-zinc-950 [&_.leaflet-control-attribution]:hidden"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />
      <Marker position={[latitude, longitude]} icon={markerIcon} />
    </MapContainer>
  )
}
