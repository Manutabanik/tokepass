"use client"

import { ArrowLeft, LoaderCircle } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { UniversalCheckoutBar } from "@/components/b2c/universal-seat-selection/checkout-bar"
import { UniversalGeneralQuantity } from "@/components/b2c/universal-seat-selection/general-quantity"
import { UniversalNumberedSeatPicker } from "@/components/b2c/universal-seat-selection/numbered-seat-picker"
import { UniversalReferenceMap } from "@/components/b2c/universal-seat-selection/reference-map"
import { UniversalSectorCards } from "@/components/b2c/universal-seat-selection/sector-cards"
import {
  UNIVERSAL_SEAT_MOCK,
  type UniversalSeat,
  type UniversalSeatSelection,
  type UniversalSector,
} from "@/lib/seating/universal-seat-types"
import { hydrateNumberedSectorFromUnits } from "@/lib/seating/venue-adapter"
import type { EventSeatingUnit } from "@/types/venues"
import { cn } from "@/lib/utils"

type UniversalSeatSelectionFlowProps = {
  sectors?: UniversalSector[]
  mapImageUrl?: string | null
  eventTitle?: string
  pending?: boolean
  embedded?: boolean
  onBack?: () => void
  onContinue?: (selection: UniversalSeatSelection) => void
  onLoadSectorUnits?: (sectorId: string) => Promise<EventSeatingUnit[]>
}

export function UniversalSeatSelectionFlow({
  sectors = UNIVERSAL_SEAT_MOCK,
  mapImageUrl = null,
  eventTitle = "Selección de entradas",
  pending = false,
  embedded = false,
  onBack,
  onContinue,
  onLoadSectorUnits,
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
    // Checkout actual permite 1 ubicación numerada por operación.
    setSelectedSeatIds((current) =>
      current.includes(seat.id) ? [] : [seat.id],
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
