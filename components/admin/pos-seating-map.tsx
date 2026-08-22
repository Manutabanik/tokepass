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
import { buildTierUnitPriceIndex } from "@/lib/checkout/tier-price-index"
import { resolveTierIdForUniversalSector } from "@/lib/seating/venue-adapter"
import { flattenVenueMapSeats } from "@/lib/seating/venue-map-geometry"
import { occupancyFromSeatingUnits } from "@/lib/seating/venue-map-occupancy"
import { classifyZoneClick } from "@/lib/seating/map-click-target"
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
  const [snapshot, setSnapshot] = useState<{
    eventId: string
    map: InteractiveVenueMap | null
    occupancy: Record<string, "available" | "occupied" | "blocked">
  } | null>(null)

  const priceBySectorId = useMemo(
    () =>
      buildTierUnitPriceIndex(
        event.tiers.map((tier) => ({
          id: tier.id,
          price: tier.price,
          seatingSectorId: tier.seatingSectorId,
        })),
      ),
    [event.tiers],
  )

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getPublicEventVenueMap(event.id),
      getEventSeatingAvailability(event.id),
    ]).then(([venueMap, units]) => {
      if (cancelled) return
      setSnapshot({
        eventId: event.id,
        map: venueMap,
        occupancy: venueMap
          ? occupancyFromSeatingUnits(
              units,
              flattenVenueMapSeats(venueMap).map((seat) => seat.id),
            )
          : {},
      })
    })
    return () => {
      cancelled = true
    }
  }, [event.id])

  const map = snapshot?.eventId === event.id ? snapshot.map : null
  const occupancy =
    snapshot?.eventId === event.id ? snapshot.occupancy : {}
  const loading = snapshot?.eventId !== event.id

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
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!map) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Este evento no tiene un plano interactivo. Usa la vista rapida de
        entradas.
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
      <InteractiveSeatingCanvas
        map={map}
        eventId={event.id}
        fillParent
        hideChrome
        hideToolbar
        posWorkstation
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
          if (classifyZoneClick(zone, map) === "SECTOR_NUMERADO") {
            toast.error("Elegí una mesa o silla de este sector.")
            return
          }
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
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm">
          <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Libre
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm">
          <span className="size-2.5 rounded-full bg-red-500/80" aria-hidden="true" />
          Ocupado
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/70 bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm">
          <span className="size-2.5 rounded-full border border-amber-200 bg-amber-400 shadow-[0_0_8px_rgba(250,204,21,0.85)]" aria-hidden="true" />
          En carrito
        </span>
      </div>
    </div>
  )
}
