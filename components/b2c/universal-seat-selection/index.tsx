"use client"

import { ArrowLeft, LoaderCircle } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { UniversalCheckoutBar } from "@/components/b2c/universal-seat-selection/checkout-bar"
import { UniversalGeneralQuantity } from "@/components/b2c/universal-seat-selection/general-quantity"
import { UniversalNumberedSeatPicker } from "@/components/b2c/universal-seat-selection/numbered-seat-picker"
import { UniversalReferenceMap } from "@/components/b2c/universal-seat-selection/reference-map"
import { UniversalSectorCards } from "@/components/b2c/universal-seat-selection/sector-cards"
import {
  InteractiveSeatingCanvas,
  type InteractiveSelectedSeat,
} from "@/components/public/interactive-seating-canvas"
import {
  UNIVERSAL_SEAT_MOCK,
  type SeatStatus,
  type UniversalSeat,
  type UniversalSeatSelection,
  type UniversalSector,
} from "@/lib/seating/universal-seat-types"
import { listMicroOccupancySectorIds } from "@/lib/seating/adaptive-seating"
import { hydrateNumberedSectorFromUnits } from "@/lib/seating/venue-adapter"
import {
  flattenVenueMapSeats,
  venueMapHasInventory,
} from "@/lib/seating/venue-map-geometry"
import { occupancyFromSeatingUnits } from "@/lib/seating/venue-map-occupancy"
import type { InteractiveVenueMap } from "@/types/venue-map"
import type { EventSeatingUnit } from "@/types/venues"
import { cn } from "@/lib/utils"

type UniversalSeatSelectionFlowProps = {
  sectors?: UniversalSector[]
  mapImageUrl?: string | null
  venueMap?: InteractiveVenueMap | null
  eventId?: string | null
  eventTitle?: string
  pending?: boolean
  embedded?: boolean
  takeover?: boolean
  onBack?: () => void
  onContinue?: (selection: UniversalSeatSelection) => void
  onLoadSectorUnits?: (sectorId: string) => Promise<EventSeatingUnit[]>
  onLoadAllUnits?: () => Promise<EventSeatingUnit[]>
}

export function UniversalSeatSelectionFlow({
  sectors = UNIVERSAL_SEAT_MOCK,
  mapImageUrl = null,
  venueMap = null,
  eventId = null,
  eventTitle = "Selección de entradas",
  pending = false,
  embedded = false,
  takeover = false,
  onBack,
  onContinue,
  onLoadSectorUnits,
  onLoadAllUnits,
}: UniversalSeatSelectionFlowProps) {
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([])
  const [hydratedSectors, setHydratedSectors] = useState<
    Record<string, UniversalSector>
  >({})
  const [loadingSectorId, setLoadingSectorId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mapOccupancy, setMapOccupancy] = useState<Record<string, SeatStatus>>(
    {},
  )
  const [mapHydrating, setMapHydrating] = useState(false)
  const mapHydrated = useRef(false)
  const loadSectorUnitsRef = useRef(onLoadSectorUnits)
  const loadAllUnitsRef = useRef(onLoadAllUnits)
  useEffect(() => {
    loadSectorUnitsRef.current = onLoadSectorUnits
    loadAllUnitsRef.current = onLoadAllUnits
  }, [onLoadAllUnits, onLoadSectorUnits])

  const hasInteractiveMap = venueMapHasInventory(venueMap)

  const resolvedSectors = useMemo(
    () =>
      sectors.map((sector) => hydratedSectors[sector.id] ?? sector),
    [hydratedSectors, sectors],
  )

  const sector = useMemo(
    () => resolvedSectors.find((item) => item.id === sectorId) ?? null,
    [sectorId, resolvedSectors],
  )

  const selection = useMemo<UniversalSeatSelection | null>(() => {
    if (!sector) return null

    if (sector.type === "general") {
      return {
        kind: "general",
        sectorId: sector.id,
        sectorName: sector.name,
        color: sector.color,
        unitPrice: sector.price,
        quantity,
      }
    }

    const group =
      sector.groups.find((item) => item.id === groupId) ??
      sector.groups[0] ??
      null
    if (!group || selectedSeatIds.length === 0) return null

    const seats = group.seats
      .filter((seat) => selectedSeatIds.includes(seat.id))
      .map((seat) => ({ id: seat.id, label: seat.label }))

    if (seats.length === 0) return null

    return {
      kind: "numbered",
      sectorId: sector.id,
      sectorName: sector.name,
      color: sector.color,
      unitPrice: sector.price,
      groupId: group.id,
      groupName: group.name,
      seats,
    }
  }, [groupId, quantity, sector, selectedSeatIds])

  useEffect(() => {
    if (!hasInteractiveMap || !venueMap || mapHydrated.current) {
      return
    }
    if (!loadAllUnitsRef.current && !loadSectorUnitsRef.current) {
      return
    }
    mapHydrated.current = true
    let cancelled = false
    setMapHydrating(true)
    void (async () => {
      try {
        const ids = listMicroOccupancySectorIds(venueMap)
        const loadAll = loadAllUnitsRef.current
        const loadSector = loadSectorUnitsRef.current
        const useBatch = Boolean(loadAll) && ids.length > 6
        const units = useBatch
          ? await loadAll!()
          : (
              await Promise.all(
                ids.map(async (id) => (loadSector ? loadSector(id) : [])),
              )
            ).flat()
        if (cancelled) return
        const knownIds = flattenVenueMapSeats(venueMap).map((seat) => seat.id)
        setMapOccupancy(occupancyFromSeatingUnits(units, knownIds))
      } catch {
        if (!cancelled) {
          const knownIds = flattenVenueMapSeats(venueMap).map((seat) => seat.id)
          setMapOccupancy(occupancyFromSeatingUnits([], knownIds))
          setLoadError("No se pudieron cargar las ubicaciones del plano.")
        }
      } finally {
        if (!cancelled) setMapHydrating(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hasInteractiveMap, venueMap])

  function handleCanvasContinue(seats: InteractiveSelectedSeat[]) {
    const seat = seats[0]
    if (!seat || pending) return
    onContinue?.({
      kind: "numbered",
      sectorId: seat.sectorId,
      sectorName: seat.sectorName,
      color: seat.color,
      unitPrice: seat.price,
      groupId: `${seat.sectorId}-row-${seat.row}`,
      groupName: `Fila ${seat.row}`,
      seats: [{ id: seat.id, label: `${seat.row}-${seat.number}` }],
    })
  }

  async function handleSelectSector(nextId: string) {
    setSectorId(nextId)
    setQuantity(1)
    setSelectedSeatIds([])
    setLoadError(null)
    const next = resolvedSectors.find((item) => item.id === nextId)
    if (next?.type === "numbered") {
      setGroupId(next.groups[0]?.id ?? null)
      const needsUnits =
        next.groups.every((group) => group.seats.length === 0) &&
        Boolean(onLoadSectorUnits)
      if (needsUnits && onLoadSectorUnits) {
        setLoadingSectorId(nextId)
        try {
          const units = await onLoadSectorUnits(nextId)
          const hydrated = hydrateNumberedSectorFromUnits(next, units)
          setHydratedSectors((current) => ({ ...current, [nextId]: hydrated }))
          setGroupId(hydrated.groups[0]?.id ?? null)
        } catch {
          setLoadError("No se pudieron cargar las ubicaciones de esta zona.")
        } finally {
          setLoadingSectorId(null)
        }
      }
    } else {
      setGroupId(null)
    }
  }

  function handleGroupChange(nextGroupId: string) {
    setGroupId(nextGroupId)
    setSelectedSeatIds([])
  }

  function handleToggleSeat(seat: UniversalSeat) {
    if (seat.status !== "available") return
    setSelectedSeatIds((current) =>
      current.includes(seat.id) ? [] : [seat.id],
    )
  }

  const generalSectors = useMemo(
    () => resolvedSectors.filter((item) => item.type === "general"),
    [resolvedSectors],
  )
  const priceBySectorId = useMemo(() => {
    const prices: Record<string, number> = {}
    for (const item of resolvedSectors) {
      prices[item.id] = item.price
    }
    return prices
  }, [resolvedSectors])

  if (hasInteractiveMap && venueMap) {
    return (
      <div
        className={cn(
          "relative text-zinc-100",
          takeover
            ? "flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950"
            : embedded
              ? "space-y-6"
              : "min-h-screen bg-zinc-950 pb-8",
        )}
      >
        {takeover ? null : (
          <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-[0.18em] text-zinc-500 uppercase">
                  Elegí tu lugar
                </p>
                <h1 className="text-2xl font-black tracking-tight text-white">
                  {eventTitle}
                </h1>
                <p className="text-sm text-zinc-500">
                  Tocá la butaca en el plano. Sin pasos intermedios.
                </p>
              </div>
              {onBack ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={onBack}
                  className="shrink-0 rounded-full border-white/10 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                >
                  <ArrowLeft aria-hidden="true" />
                  Volver
                </Button>
              ) : null}
            </header>
          </div>
        )}

        <div
          className={cn(
            takeover
              ? "flex h-full min-h-0 flex-1 flex-col"
              : "mx-auto max-w-6xl px-4 pb-4 sm:px-6",
          )}
        >
          {mapHydrating ? (
            <div
              className={cn(
                "flex items-center justify-center border border-white/10 bg-zinc-950",
                takeover
                  ? "h-full min-h-0 flex-1"
                  : "relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-white/10 bg-zinc-950 min-h-[min(70dvh,36rem)]",
              )}
            >
              <LoaderCircle className="size-6 animate-spin text-emerald-400" />
            </div>
          ) : (
            <InteractiveSeatingCanvas
              map={venueMap}
              eventId={eventId}
              occupancyBySeatId={mapOccupancy}
              priceBySectorId={priceBySectorId}
              pending={pending}
              fillParent={takeover}
              onBack={onBack}
              onContinue={handleCanvasContinue}
              onSelectZone={(zone) => {
                const match =
                  resolvedSectors.find((item) => item.id === zone.id) ??
                  resolvedSectors.find(
                    (item) =>
                      item.name.toLowerCase() === zone.name.toLowerCase(),
                  )
                void handleSelectSector(match?.id ?? zone.id)
              }}
            />
          )}
        </div>

        {loadError ? (
          <p className="shrink-0 px-4 text-sm text-rose-300">
            {loadError}
          </p>
        ) : null}

        {generalSectors.length > 0 ? (
          <div className={cn("space-y-4", takeover ? "shrink-0 px-4 pb-4" : "pb-24")}>
            <UniversalSectorCards
              sectors={generalSectors}
              selectedId={sectorId}
              onSelect={handleSelectSector}
            />
            {sector?.type === "general" ? (
              <UniversalGeneralQuantity
                quantity={quantity}
                maxPerUser={sector.maxPerUser}
                accentColor={sector.color}
                onChange={setQuantity}
              />
            ) : null}
          </div>
        ) : null}

        {sector?.type === "general" ? (
          <UniversalCheckoutBar
            selection={selection}
            pending={pending}
            sticky={embedded || takeover}
            onContinue={() => {
              if (!selection || pending) return
              onContinue?.(selection)
            }}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative text-zinc-900 dark:text-zinc-100",
        embedded
          ? "rounded-3xl border border-zinc-200 bg-slate-50 pb-24 dark:border-zinc-800 dark:bg-zinc-950"
          : "min-h-screen bg-slate-50 pb-28 dark:bg-zinc-950",
      )}
    >
      <div className="mx-auto max-w-lg space-y-8 px-4 py-6 sm:px-6">
        <header className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Elegí tu lugar
              </p>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
                {eventTitle}
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-500">
                Mirá el mapa y elegí zona, cantidad o asiento.
              </p>
            </div>
            {onBack ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onBack}
                className="shrink-0 rounded-full border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <ArrowLeft aria-hidden="true" />
                Volver
              </Button>
            ) : null}
          </div>
        </header>

        <UniversalReferenceMap
          imageUrl={mapImageUrl}
          venueMap={venueMap}
          highlightedColor={sector?.color}
        />

        <UniversalSectorCards
          sectors={resolvedSectors}
          selectedId={sectorId}
          onSelect={handleSelectSector}
        />

        {loadingSectorId === sectorId ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Cargando ubicaciones de esta zona…
          </div>
        ) : null}

        {loadError ? (
          <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {loadError}
          </p>
        ) : null}

        {sector?.type === "general" ? (
          <UniversalGeneralQuantity
            quantity={quantity}
            maxPerUser={sector.maxPerUser}
            accentColor={sector.color}
            onChange={setQuantity}
          />
        ) : null}

        {sector?.type === "numbered" && loadingSectorId !== sector.id ? (
          <UniversalNumberedSeatPicker
            sector={sector}
            groupId={groupId}
            selectedSeatIds={selectedSeatIds}
            onGroupChange={handleGroupChange}
            onToggleSeat={handleToggleSeat}
          />
        ) : null}
      </div>

      <UniversalCheckoutBar
        selection={selection}
        pending={pending}
        sticky={embedded}
        onContinue={() => {
          if (!selection || pending) return
          onContinue?.(selection)
        }}
      />
    </div>
  )
}
