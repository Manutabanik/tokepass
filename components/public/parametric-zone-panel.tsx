"use client"

import { LayoutGrid, LoaderCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import {
  ParametricSelectionStrip,
  type ParametricStripItem,
} from "@/components/public/parametric-selection-strip"
import { Button } from "@/components/ui/button"
import {
  countFreeByParametricRow,
  listParametricZoneRowMeta,
  parametricZoneItemShortLabel,
  parametricZoneRowItems,
  type ParametricOccupiedItem,
  type ParametricInventoryState,
} from "@/lib/seating/adaptive-seating"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { VenueMapZone } from "@/types/venue-map"

type Props = {
  zone: VenueMapZone
  inventoryState: ParametricInventoryState
  occupancy: Record<string, ParametricOccupiedItem>
  selectedId: string | null
  pending?: boolean
  preview?: boolean
  onSelect: (item: ParametricOccupiedItem) => void
}

function resolveItem(
  zone: VenueMapZone,
  item: { id: string; label: string; col: number },
  occupancy: Record<string, ParametricOccupiedItem>,
  inventoryState: ParametricInventoryState,
  preview: boolean,
): ParametricStripItem & { seatingUnitId: string | null } {
  const live = occupancy[item.id]
  const shortLabel = parametricZoneItemShortLabel(zone.layoutType, item.col)
  if (live) {
    return {
      id: live.id,
      label: live.label || item.label,
      shortLabel,
      status: live.status,
      seatingUnitId: live.seatingUnitId,
    }
  }
  if (preview && inventoryState !== "loading") {
    return {
      id: item.id,
      label: item.label,
      shortLabel,
      status: "available",
      seatingUnitId: "preview",
    }
  }
  return {
    id: item.id,
    label: item.label,
    shortLabel,
    status: "occupied",
    seatingUnitId: null,
  }
}

export function ParametricZonePanel({
  zone,
  inventoryState,
  occupancy,
  selectedId,
  pending = false,
  preview = false,
  onSelect,
}: Props) {
  const rowsMeta = useMemo(() => listParametricZoneRowMeta(zone), [zone])
  const freeByRow = useMemo(
    () => (preview ? {} : countFreeByParametricRow(zone.id, occupancy)),
    [occupancy, preview, zone.id],
  )
  const [selectedRowId, setSelectedRowId] = useState<string | null>(
    rowsMeta.length === 1 ? (rowsMeta[0]?.rowId ?? null) : null,
  )

  useEffect(() => {
    const meta = listParametricZoneRowMeta(zone)
    setSelectedRowId(meta.length === 1 ? (meta[0]?.rowId ?? null) : null)
  }, [zone.id])

  const activeRow = rowsMeta.find((row) => row.rowId === selectedRowId) ?? null

  const rows = useMemo(
    () =>
      rowsMeta.map((row) => ({
        rowId: row.rowId,
        rowLabel: row.rowLabel,
        itemCount: row.itemCount,
        freeCount: preview ? row.itemCount : (freeByRow[row.rowNumber] ?? 0),
      })),
    [freeByRow, preview, rowsMeta],
  )

  const items = useMemo(() => {
    if (!activeRow) return []
    return parametricZoneRowItems(zone, activeRow.rowNumber).map((item, index) =>
      resolveItem(
        zone,
        { ...item, col: index + 1 },
        occupancy,
        inventoryState,
        preview,
      ),
    )
  }, [activeRow, inventoryState, occupancy, preview, zone])

  if (inventoryState === "loading") {
    return (
      <div className="flex h-20 items-center justify-center gap-2 text-zinc-400">
        <LoaderCircle className="size-5 animate-spin text-cyan-300" />
        <p className="text-sm">Cargando filas de {zone.name}…</p>
      </div>
    )
  }

  if (inventoryState === "error") {
    return (
      <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
        No se pudieron cargar las mesas de esta zona. Cerrá e intentá de nuevo.
      </p>
    )
  }

  if (inventoryState === "unmaterialized") {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <p className="flex items-center gap-2 font-semibold">
          <LayoutGrid className="size-4 shrink-0" aria-hidden="true" />
          Inventario todavía no publicado
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-100/80">
          Las mesas de esta zona no están materializadas en stock.
        </p>
      </div>
    )
  }

  return (
    <ParametricSelectionStrip
      zoneName={zone.name}
      color={zone.color}
      rows={rows}
      items={items}
      selectedRowId={selectedRowId}
      selectedId={selectedId}
      pending={pending}
      onSelectRow={setSelectedRowId}
      onBackToRows={() => setSelectedRowId(null)}
      onSelect={(item) => {
        if (item.status !== "available") return
        onSelect({
          id: item.id,
          label: item.label,
          status: item.status as SeatStatus,
          seatingUnitId: item.seatingUnitId ?? null,
        })
      }}
    />
  )
}

export function ParametricZonePanelFooter({
  canContinue,
  pending,
  onContinue,
}: {
  canContinue: boolean
  pending: boolean
  onContinue: () => void
}) {
  return (
    <div className="shrink-0 pt-3">
      <Button
        type="button"
        className="h-12 w-full"
        disabled={pending || !canContinue}
        onClick={onContinue}
      >
        Confirmar ubicación
      </Button>
    </div>
  )
}
