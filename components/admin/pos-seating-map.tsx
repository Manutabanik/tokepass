"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { getEventSeatingAvailability } from "@/app/actions/public-events"
import {
  getPosSeatingCatalog,
  type PosEventOption,
  type PosSeatingCatalog,
} from "@/app/actions/pos"
import { posSeatPickMatchesDay, type PosSeatPick } from "@/lib/pos-cart"
import { buildTierUnitPriceIndex } from "@/lib/checkout/tier-price-index"
import { resolveLiveVenueMapForDay } from "@/lib/seating/live-venue-map-for-day"
import { resolveTierIdForUniversalSector } from "@/lib/seating/venue-adapter"
import {
  hydrateVenueMapOccupancy,
  soldOutTicketTypeIds,
} from "@/lib/seating/map-inventory-hydration"
import { seatingUnitsForOccupancyDay } from "@/lib/seating/venue-map-occupancy"
import { classifyZoneClick } from "@/lib/seating/map-click-target"
import {
  storefrontItemFromElement,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { VenueMapElement } from "@/types/venue-map"

const InteractiveSeatingCanvas = dynamic(
  () =>
    import("@/components/public/interactive-seating-canvas").then(
      (mod) => mod.InteractiveSeatingCanvas,
    ),
  { ssr: false },
)

export function PosSeatingMap({
  event,
  heldPicks,
  disabled = false,
  onToggleSeat,
}: {
  event: PosEventOption
  heldPicks: PosSeatPick[]
  disabled?: boolean
  onToggleSeat: (pick: PosSeatPick) => void
}) {
  const [catalog, setCatalog] = useState<PosSeatingCatalog | null>(null)
  const [catalogError, setCatalogError] = useState(false)
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<{
    eventId: string
    dateId: string | null
    occupancy: Record<string, SeatStatus>
  } | null>(null)

  const priceBySectorId = useMemo(
    () =>
      buildTierUnitPriceIndex(
        (event.tiers ?? []).map((tier) => ({
          id: tier.id,
          price: tier.price,
          seatingSectorId: tier.seatingSectorId,
        })),
      ),
    [event.tiers],
  )

  const [catalogEventId, setCatalogEventId] = useState(event.id)
  if (catalogEventId !== event.id) {
    setCatalogEventId(event.id)
    setCatalog(null)
    setCatalogError(false)
    setSelectedDateId(null)
    setSnapshot(null)
  }

  useEffect(() => {
    let cancelled = false
    void getPosSeatingCatalog(event.id)
      .then((next) => {
        if (cancelled) return
        if (!next) {
          setCatalogError(true)
          return
        }
        setCatalogError(false)
        setCatalog(next)
        setSelectedDateId(next.days[0]?.id ?? null)
      })
      .catch(() => {
        if (cancelled) return
        setCatalogError(true)
        toast.error("No se pudo cargar el plano de asientos.")
      })
    return () => {
      cancelled = true
    }
  }, [event.id])

  const scheduleDayCount = catalog?.days.length ?? 0
  const liveMap = useMemo(
    () =>
      catalog
        ? resolveLiveVenueMapForDay({
            selectedDateId,
            scheduleDayCount,
            seatingMaps: catalog.seatingMaps,
            fallback: catalog.fallbackMap,
          })
        : null,
    [catalog, scheduleDayCount, selectedDateId],
  )

  if (
    catalog &&
    scheduleDayCount >= 2 &&
    !selectedDateId &&
    (snapshot?.eventId !== event.id || snapshot.dateId !== null)
  ) {
    setSnapshot({ eventId: event.id, dateId: null, occupancy: {} })
  }

  useEffect(() => {
    if (!catalog) return
    if (scheduleDayCount >= 2 && !selectedDateId) return
    let cancelled = false
    void getEventSeatingAvailability(event.id, selectedDateId)
      .then((units) => {
      if (cancelled) return
      const scoped = seatingUnitsForOccupancyDay(units, {
        eventDateId: selectedDateId,
        scheduleDayCount,
      })
      setSnapshot({
        eventId: event.id,
        dateId: selectedDateId,
        occupancy: hydrateVenueMapOccupancy(liveMap, {
          seatingUnits: scoped.map((unit) => ({
            id: unit.id,
            layoutItemId: unit.layoutItemId,
            status: unit.status,
            reservedUntil: unit.reservedUntil,
          })),
          soldOutTicketTypeIds: soldOutTicketTypeIds(event.tiers ?? []),
        }),
      })
    })
      .catch(() => {
        if (cancelled) return
        setSnapshot({
          eventId: event.id,
          dateId: selectedDateId,
          occupancy: {},
        })
        toast.error("No se pudo actualizar la ocupación del mapa.")
      })
    return () => {
      cancelled = true
    }
  }, [catalog, event.id, event.tiers, liveMap, scheduleDayCount, selectedDateId])

  const occupancy =
    snapshot?.eventId === event.id && snapshot.dateId === selectedDateId
      ? snapshot.occupancy
      : {}
  const loading = !catalogError && (!catalog || snapshot?.eventId !== event.id)

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
      (event.tiers ?? []).map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        available: tier.available,
        seatingSectorId: tier.seatingSectorId,
        layoutType: "numbered_seat",
      })),
    )
    if (!tierId) return null
    const tier = (event.tiers ?? []).find((item) => item.id === tierId)
    return {
      seatId,
      eventDateId: selectedDateId,
      tierId,
      label,
      sectorName,
      price: tier?.price ?? fallbackPrice,
    }
  }

  if (catalogError) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No se pudo cargar el plano de asientos.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (scheduleDayCount >= 2 && !selectedDateId) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Elegí la jornada para ver el plano.
      </div>
    )
  }

  if (!liveMap) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Este evento no tiene un plano interactivo para esta jornada. Usa la
        vista rapida de entradas.
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
      {catalog && (catalog.days ?? []).length >= 2 ? (
        <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-1.5">
          {(catalog.days ?? []).map((day) => (
            <button
              key={day.id}
              type="button"
              onClick={() => setSelectedDateId(day.id)}
              className={
                day.id === selectedDateId
                  ? "rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                  : "rounded-full border border-border bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-foreground"
              }
            >
              {day.label}
            </button>
          ))}
        </div>
      ) : null}
      <InteractiveSeatingCanvas
        map={liveMap}
        eventId={event.id}
        eventDateId={selectedDateId}
        scheduleDayCount={scheduleDayCount}
        fillParent
        hideChrome
        hideToolbar
        posWorkstation
        disableIdlePrompt
        silentHover
        pending={disabled}
        occupancyBySeatId={occupancy}
        priceBySectorId={priceBySectorId}
        heldSeatIds={heldPicks
          .filter((pick) =>
            posSeatPickMatchesDay(pick, selectedDateId, scheduleDayCount),
          )
          .map((pick) => pick.seatId)}
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
          if (classifyZoneClick(zone, liveMap) === "SECTOR_NUMERADO") {
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
