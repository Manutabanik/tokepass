"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import {
  getEventSeatingAvailability,
  getPublicEventVenueMap,
} from "@/app/actions/public-events"
import type { PosEventOption } from "@/app/actions/pos"
import type { PosSeatPick } from "@/lib/pos-cart"
import { resolveTierIdForUniversalSector } from "@/lib/seating/venue-adapter"
import { flattenVenueMapSeats } from "@/lib/seating/venue-map-geometry"
import { occupancyFromSeatingUnits } from "@/lib/seating/venue-map-occupancy"
import {
  storefrontItemFromElement,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import type { InteractiveVenueMap, VenueMapElement } from "@/types/venue-map"

const InteractiveSeatingCanvas = dynamic(
  () =>
    import("@/components/public/interactive-seating-canvas").then(
      (mod) => mod.InteractiveSeatingCanvas,
    ),
  { ssr: false },
)

export function PosSeatingMap({
  event,
  heldSeatIds,
  disabled = false,
  onToggleSeat,
}: {
  event: PosEventOption
  heldSeatIds: string[]
  disabled?: boolean
  onToggleSeat: (pick: PosSeatPick) => void
}) {
  const [map, setMap] = useState<InteractiveVenueMap | null>(null)
  const [occupancy, setOccupancy] = useState<
    Record<string, "available" | "occupied" | "blocked">
  >({})
  const [loading, setLoading] = useState(true)

  const priceBySectorId = useMemo(() => {
    const prices: Record<string, number> = {}
    for (const tier of event.tiers) {
      if (tier.seatingSectorId) prices[tier.seatingSectorId] = tier.price
      prices[tier.id] = tier.price
      prices[tier.name] = tier.price
    }
    return prices
  }, [event.tiers])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setMap(null)
    void Promise.all([
      getPublicEventVenueMap(event.id),
      getEventSeatingAvailability(event.id),
    ]).then(([venueMap, units]) => {
      if (cancelled) return
      setMap(venueMap)
      if (venueMap) {
        const known = flattenVenueMapSeats(venueMap).map((seat) => seat.id)
        setOccupancy(occupancyFromSeatingUnits(units, known))
      } else {
        setOccupancy({})
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [event.id])

  function resolvePick(
    seatId: string,
    sectorId: string,
    sectorName: string,
    label: string,
    fallbackPrice: number,
  ): PosSeatPick | null {
    const tierId = resolveTierIdForUniversalSector(
      sectorId,
      sectorName,
      event.tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        available: tier.available,
        seatingSectorId: tier.seatingSectorId,
        layoutType: "numbered_seat",
      })),
    )
    if (!tierId) return null
    const tier = event.tiers.find((item) => item.id === tierId)
    return {
      seatId,
      tierId,
      label,
      sectorName,
      price: tier?.price ?? fallbackPrice,
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-border">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!map) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Este evento no tiene un plano interactivo. Usa la vista rapida de
        entradas.
      </div>
    )
  }

  return (
    <div className="flex h-[min(70vh,36rem)] flex-col">
      <InteractiveSeatingCanvas
        map={map}
        fillParent
        hideChrome
        disableIdlePrompt
        silentHover
        pending={disabled}
        occupancyBySeatId={occupancy}
        priceBySectorId={priceBySectorId}
        heldSeatIds={heldSeatIds}
        posStatusColors
        maxSelectable={200}
        onContinue={() => undefined}
        onPickSeat={(seat) => {
          const pick = resolvePick(
            seat.id,
            seat.sectorId,
            seat.sectorName,
            `${seat.row}-${seat.number}`,
            seat.price,
          )
          if (pick) onToggleSeat(pick)
          else toast.error("No hay tipo de entrada para ese sector.")
        }}
        onPickElement={(element: VenueMapElement) => {
          const item = storefrontItemFromElement(element, priceBySectorId)
          if (!item) return
          const pick = resolvePick(
            item.id,
            item.sectorId ?? element.id,
            element.sectorName || item.name,
            item.name,
            item.price,
          )
          if (pick) onToggleSeat(pick)
          else toast.error("No hay tipo de entrada para ese sector.")
        }}
        onSelectZone={(zone) => {
          const item = storefrontItemFromZone(zone, priceBySectorId)
          if (!item) return
          const pick = resolvePick(
            item.id,
            item.sectorId ?? zone.id,
            zone.name,
            item.name,
            item.price,
          )
          if (pick) onToggleSeat(pick)
          else toast.error("No hay tipo de entrada para ese sector.")
        }}
      />
    </div>
  )
}
