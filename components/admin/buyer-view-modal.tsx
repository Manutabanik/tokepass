"use client"

import { ArrowLeft, Calendar, MapPin } from "lucide-react"

import { AdaptiveSeatingFlow } from "@/components/public/adaptive-seating-flow"
import { InteractiveSeatingCanvas } from "@/components/public/interactive-seating-canvas"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { hasParametricZones } from "@/lib/seating/adaptive-seating"
import { flattenVenueMapSeats } from "@/lib/seating/venue-map-geometry"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function BuyerViewModal({
  open,
  map,
  eventTitle,
  eventDate,
  venueLabel,
  onClose,
}: {
  open: boolean
  map: InteractiveVenueMap
  eventTitle: string
  eventDate?: string
  venueLabel?: string
  onClose: () => void
}) {
  if (!open) return null

  const legend = uniqueLegend(map)

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-zinc-950 text-white">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 md:px-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-foreground">
            {eventTitle}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
            {eventDate ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" aria-hidden="true" />
                {eventDate}
              </span>
            ) : null}
            {venueLabel ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{venueLabel}</span>
              </span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="shrink-0 text-zinc-300 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Volver al editor
        </Button>
      </header>

      {legend.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 px-4 py-3 md:px-6">
          {legend.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
              {item.price > 0 ? ` · ${formatCurrency(item.price)}` : ""}
            </span>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasParametricZones(map) ? (
          <AdaptiveSeatingFlow
            embedded
            preview
            eventTitle={eventTitle}
            venueMap={map}
            onBack={onClose}
          />
        ) : (
          <InteractiveSeatingCanvas
            map={map}
            fillParent
            disableIdlePrompt
            onContinue={() => undefined}
            onBack={onClose}
          />
        )}
      </div>
    </div>
  )
}

function uniqueLegend(map: InteractiveVenueMap) {
  const items: Array<{ id: string; name: string; color: string; price: number }> =
    []
  const seen = new Set<string>()
  for (const sector of map.sectors) {
    if (seen.has(sector.id)) continue
    seen.add(sector.id)
    items.push({
      id: sector.id,
      name: sector.name,
      color: sector.color,
      price: sector.price,
    })
  }
  for (const zone of map.zones ?? []) {
    if (seen.has(zone.id)) continue
    seen.add(zone.id)
    items.push({
      id: zone.id,
      name: zone.name,
      color: zone.color,
      price: zone.price,
    })
  }
  for (const seat of flattenVenueMapSeats(map)) {
    if (seen.has(seat.sectorId)) continue
    seen.add(seat.sectorId)
    items.push({
      id: seat.sectorId,
      name: seat.sectorName,
      color: seat.color,
      price: seat.price,
    })
  }
  return items
}
