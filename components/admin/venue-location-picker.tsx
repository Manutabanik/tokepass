"use client"

import { LoaderCircle, MapPin, Search } from "lucide-react"
import dynamic from "next/dynamic"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { VenueCoordinates } from "@/components/admin/venue-leaflet-map"

const VenueLeafletMap = dynamic(
  () =>
    import("@/components/admin/venue-leaflet-map").then(
      (module) => module.VenueLeafletMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-zinc-950 text-sm text-zinc-500">
        <LoaderCircle className="mr-2 inline size-4 animate-spin" />
        Cargando mapa…
      </div>
    ),
  },
)

type GeocodingResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address?: {
    city?: string
    town?: string
    village?: string
    municipality?: string
    state?: string
  }
}

export function VenueLocationPicker({
  address,
  city,
  coordinates,
  onAddressChange,
  onCityChange,
  onCoordinatesChange,
}: {
  address: string
  city: string
  coordinates: VenueCoordinates | null
  onAddressChange: (address: string) => void
  onCityChange: (city: string) => void
  onCoordinatesChange: (coordinates: VenueCoordinates) => void
}) {
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function searchAddress() {
    const query = [address.trim(), city.trim(), "Argentina"]
      .filter(Boolean)
      .join(", ")

    if (!address.trim()) {
      setMessage("Ingresá una dirección para buscar.")
      return
    }

    setSearching(true)
    setMessage(null)
    try {
      const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        addressdetails: "1",
        limit: "5",
        countrycodes: "ar",
      })
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          headers: { "Accept-Language": "es-AR,es;q=0.9" },
        },
      )
      if (!response.ok) throw new Error("geocoding_failed")
      const data = (await response.json()) as GeocodingResult[]
      setResults(data)
      if (data.length === 0) {
        setMessage("No encontramos coincidencias. Probá con más detalle.")
      }
    } catch {
      setMessage("No pudimos consultar el mapa. Intentá nuevamente.")
    } finally {
      setSearching(false)
    }
  }

  function chooseResult(result: GeocodingResult) {
    const latitude = Number(result.lat)
    const longitude = Number(result.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

    onAddressChange(result.display_name)
    const resolvedCity =
      result.address?.city ??
      result.address?.town ??
      result.address?.village ??
      result.address?.municipality
    if (resolvedCity) onCityChange(resolvedCity)
    onCoordinatesChange({ latitude, longitude })
    setResults([])
    setMessage("Ubicación encontrada. Podés ajustar el pin en el mapa.")
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <MapPin className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-bold text-white">Ubicación exacta</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Buscá la dirección y arrastrá el pin para ajustar el acceso.
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600"
            aria-hidden="true"
          />
          <Input
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void searchAddress()
              }
            }}
            placeholder="Av. Corrientes 1660, CABA"
            aria-label="Buscar dirección"
            className="h-12 rounded-xl border-zinc-800 bg-zinc-950 pl-9 text-sm text-white"
          />
        </div>
        <Button
          type="button"
          onClick={() => void searchAddress()}
          disabled={searching}
          className="h-12 rounded-xl bg-zinc-800 px-4 text-white hover:bg-zinc-700"
          aria-label="Buscar en el mapa"
        >
          {searching ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
        </Button>
      </div>

      {results.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
          {results.map((result) => (
            <button
              key={result.place_id}
              type="button"
              onClick={() => chooseResult(result)}
              className="block w-full border-b border-zinc-800/70 px-3 py-2.5 text-left text-xs leading-relaxed text-zinc-300 transition last:border-0 hover:bg-zinc-900 hover:text-white"
            >
              {result.display_name}
            </button>
          ))}
        </div>
      ) : null}

      {message ? (
        <p className="mt-2 text-xs text-zinc-500">{message}</p>
      ) : null}

      <div className="relative mt-4 h-[340px] w-full overflow-hidden rounded-2xl border border-zinc-800 shadow-inner">
        <VenueLeafletMap
          coordinates={coordinates}
          onChange={onCoordinatesChange}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <Label
            htmlFor="venue-latitude"
            className="font-mono text-[10px] uppercase tracking-wider text-zinc-500"
          >
            Latitud
          </Label>
          <Input
            id="venue-latitude"
            value={coordinates?.latitude.toFixed(6) ?? ""}
            readOnly
            placeholder="—"
            className="mt-1 h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-400"
          />
        </div>
        <div>
          <Label
            htmlFor="venue-longitude"
            className="font-mono text-[10px] uppercase tracking-wider text-zinc-500"
          >
            Longitud
          </Label>
          <Input
            id="venue-longitude"
            value={coordinates?.longitude.toFixed(6) ?? ""}
            readOnly
            placeholder="—"
            className="mt-1 h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-400"
          />
        </div>
      </div>
    </div>
  )
}
