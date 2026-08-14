"use client"

import { divIcon } from "leaflet"
import { useEffect } from "react"
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet"

import {
  TOKEPASS_BASEMAP_ATTRIBUTION,
  TOKEPASS_BASEMAP_URL,
} from "@/lib/maps/basemap"

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

function MapSizeFix() {
  const map = useMap()
  useEffect(() => {
    const run = () => {
      const size = map.getSize()
      if (size.x < 2 || size.y < 2) return
      map.invalidateSize({ pan: false, animate: false })
    }
    run()
    const observer = new ResizeObserver(run)
    observer.observe(map.getContainer())
    const t = window.setTimeout(run, 120)
    return () => {
      observer.disconnect()
      window.clearTimeout(t)
    }
  }, [map])
  return null
}

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
      style={{ height: "100%", width: "100%" }}
      className="tokepass-leaflet-map h-full w-full bg-[#e8e4dc] [&_.leaflet-control-attribution]:hidden"
    >
      <MapSizeFix />
      <TileLayer
        attribution={TOKEPASS_BASEMAP_ATTRIBUTION}
        url={TOKEPASS_BASEMAP_URL}
        maxZoom={20}
        tileSize={256}
        zoomOffset={0}
      />
      <Marker position={[latitude, longitude]} icon={markerIcon} />
    </MapContainer>
  )
}
