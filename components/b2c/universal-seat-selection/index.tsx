"use client"

import { useMemo, useState } from "react"

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

type UniversalSeatSelectionFlowProps = {
  sectors?: UniversalSector[]
  mapImageUrl?: string | null
  eventTitle?: string
  onContinue?: (selection: UniversalSeatSelection) => void
}

export function UniversalSeatSelectionFlow({
  sectors = UNIVERSAL_SEAT_MOCK,
  mapImageUrl = null,
  eventTitle = "Selección de entradas",
  onContinue,
}: UniversalSeatSelectionFlowProps) {
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([])

  const sector = useMemo(
    () => sectors.find((item) => item.id === sectorId) ?? null,
    [sectorId, sectors],
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

  function handleSelectSector(nextId: string) {
    setSectorId(nextId)
    setQuantity(1)
    setSelectedSeatIds([])
    const next = sectors.find((item) => item.id === nextId)
    if (next?.type === "numbered") {
      setGroupId(next.groups[0]?.id ?? null)
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
      current.includes(seat.id)
        ? current.filter((id) => id !== seat.id)
        : [...current, seat.id],
    )
  }

  return (
    <div className="relative min-h-screen bg-slate-50 pb-28 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-lg space-y-8 px-4 py-6 sm:px-6">
        <header className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Elegí tu lugar
          </p>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            {eventTitle}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-500">
            Mirá el mapa y elegí zona, cantidad o asiento.
          </p>
        </header>

        <UniversalReferenceMap
          imageUrl={mapImageUrl}
          highlightedColor={sector?.color}
        />

        <UniversalSectorCards
          sectors={sectors}
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

        {sector?.type === "numbered" ? (
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
        onContinue={() => {
          if (!selection) return
          onContinue?.(selection)
        }}
      />
    </div>
  )
}
