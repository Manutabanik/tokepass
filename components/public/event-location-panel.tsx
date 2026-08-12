"use client"

import { CarFront, Copy, MapPinned, Navigation } from "lucide-react"
import dynamic from "next/dynamic"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

const EventLocationMapInner = dynamic(
  () =>
    import("@/components/public/event-location-map-inner").then(
      (mod) => mod.EventLocationMapInner,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-xs text-zinc-500">
        Cargando mapa…
      </div>
    ),
  },
)

export function EventLocationPanel({
  venueName,
  address,
  latitude = null,
  longitude = null,
}: {
  venueName: string
  address: string
  latitude?: number | null
  longitude?: number | null
}) {
  const hasCoords =
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)

  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [venueName, address].filter(Boolean).join(", "),
      )}`

  const uberQuery = encodeURIComponent(
    [venueName, address].filter(Boolean).join(", "),
  )
  const uberUrl = hasCoords
    ? `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${latitude}&dropoff[longitude]=${longitude}&dropoff[formatted_address]=${uberQuery}`
    : `https://m.uber.com/ul/?action=setPickup&dropoff[formatted_address]=${uberQuery}`

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address || venueName)
      toast.success("Dirección copiada")
    } catch {
      toast.error("No se pudo copiar la dirección")
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight text-white">Ubicación</h2>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="group relative block h-48 overflow-hidden rounded-t-2xl sm:h-56"
          aria-label="Abrir mapa"
        >
          {hasCoords ? (
            <div className="pointer-events-none absolute inset-0">
              <EventLocationMapInner
                latitude={latitude!}
                longitude={longitude!}
              />
            </div>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1f2937_0%,_#09090b_70%)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(16,185,129,0.18),transparent_45%)]" />
              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-[60%] flex-col items-center">
                <span className="grid size-12 place-items-center rounded-full bg-emerald-500 text-zinc-950 shadow-[0_0_0_10px_rgba(16,185,129,0.18)]">
                  <MapPinned className="size-6" aria-hidden="true" />
                </span>
                <span className="mt-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-zinc-100 backdrop-blur-sm">
                  Ver en Maps
                </span>
              </div>
            </div>
          )}
        </a>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-white">{venueName}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{address}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Copiar dirección"
              className="size-10 shrink-0 rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white"
              onClick={() => void copyAddress()}
            >
              <Copy className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-11 rounded-xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              nativeButton={false}
              render={<a href={mapsUrl} target="_blank" rel="noreferrer" />}
            >
              <Navigation className="size-4" aria-hidden="true" />
              Cómo llegar
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
              nativeButton={false}
              render={<a href={uberUrl} target="_blank" rel="noreferrer" />}
            >
              <CarFront className="size-4" aria-hidden="true" />
              Pedir Uber
            </Button>
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            Consultá accesibilidad y estacionamiento con el lugar. Llegá con
            margen: el ingreso puede demorar en horarios pico.
          </p>
        </div>
      </div>
    </section>
  )
}
