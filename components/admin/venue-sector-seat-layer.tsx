"use client"

import { memo } from "react"

import { TheatreSeatSymbol } from "@/components/admin/venue-svg-symbols"
import { isCommittedEditorStock } from "@/lib/seating/editor-stock-lock"
import { lookupOccupancyStatus } from "@/lib/seating/venue-map-occupancy"
import { seatBelongsToZone } from "@/lib/seating/venue-map-lod"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { cn } from "@/lib/utils"
import type { VenueMapSeat, VenueMapSector, VenueMapZone } from "@/types/venue-map"

export const EMPTY_SEAT_KEYS: ReadonlySet<string> = new Set()
export const SEAT_LABEL_MIN_ZOOM = 1.2

export function sectorSeatKey(sectorId: string, seatId: string) {
  return `${sectorId}::${seatId}`
}

const SectorSeatNode = memo(function SectorSeatNode({
  sector,
  seat,
  selected,
  showLabel,
  isolatedOut,
  occupancy,
  testOccupancy,
}: {
  sector: VenueMapSector
  seat: VenueMapSeat
  selected: boolean
  showLabel: boolean
  isolatedOut: boolean
  occupancy?: SeatStatus
  testOccupancy?: SeatStatus
}) {
  const stockLocked =
    seat.status === "blocked" || isCommittedEditorStock(occupancy)
  const testOccupied = !stockLocked && isCommittedEditorStock(testOccupancy)
  return (
    <>
      <TheatreSeatSymbol
        data-inventory="sector-seat"
        data-sector-id={sector.id}
        data-seat-id={seat.id}
        data-seat-key={sectorSeatKey(sector.id, seat.id)}
        data-locked={stockLocked ? "1" : undefined}
        data-test-stock={testOccupied ? "1" : undefined}
        cx={seat.x}
        cy={seat.y}
        width={12}
        height={12}
        rotation={seat.rotation ?? 0}
        color={stockLocked ? "#3f3f46" : sector.color}
        selected={selected && !stockLocked}
        occupied={stockLocked}
        held={occupancy === "held"}
        label={showLabel ? String(seat.number) : undefined}
        showLabel={showLabel}
        className={cn(
          isolatedOut && "pointer-events-none opacity-30 grayscale",
          stockLocked && "opacity-60 grayscale",
        )}
      />
      {testOccupied ? (
        <circle
          cx={seat.x}
          cy={seat.y}
          r={8}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.2}
          strokeDasharray="3 2"
          pointerEvents="none"
        />
      ) : null}
    </>
  )
})

export const VenueSectorSeatLayer = memo(function VenueSectorSeatLayer({
  sectors,
  selectedSectorId,
  selectedSeatKeys = EMPTY_SEAT_KEYS,
  filterKeys = EMPTY_SEAT_KEYS,
  filterMode = "exclude",
  showLabels,
  hitsEnabled,
  activeZone = null,
  occupancyBySeatId = {},
  testOccupancyBySeatId = {},
}: {
  sectors: VenueMapSector[]
  selectedSectorId: string | null
  selectedSeatKeys?: ReadonlySet<string>
  filterKeys?: ReadonlySet<string>
  filterMode?: "exclude" | "include"
  showLabels: boolean
  hitsEnabled: boolean
  activeZone?: VenueMapZone | null
  occupancyBySeatId?: Record<string, SeatStatus>
  testOccupancyBySeatId?: Record<string, SeatStatus>
}) {
  return (
    <g className={hitsEnabled ? undefined : "pointer-events-none"}>
      {sectors.map((sector) => {
        const sectorSelected = selectedSectorId === sector.id
        return (
          <g key={sector.id}>
            {(sector.seats ?? []).map((seat) => {
              const key = sectorSeatKey(sector.id, seat.id)
              if (filterMode === "exclude" && filterKeys.has(key)) return null
              if (filterMode === "include" && !filterKeys.has(key)) return null
              const isolatedOut = activeZone
                ? !seatBelongsToZone(
                    {
                      x: seat.x,
                      y: seat.y,
                      sectorId: sector.id,
                      sectorName: sector.name,
                    },
                    activeZone,
                  )
                : false
              return (
                <SectorSeatNode
                  key={seat.id}
                  sector={sector}
                  seat={seat}
                  selected={
                    sectorSelected || selectedSeatKeys.has(key)
                  }
                  showLabel={showLabels}
                  isolatedOut={isolatedOut}
                  occupancy={lookupOccupancyStatus(
                    occupancyBySeatId,
                    seat.id,
                    sector.id,
                  )}
                  testOccupancy={lookupOccupancyStatus(
                    testOccupancyBySeatId,
                    seat.id,
                    sector.id,
                  )}
                />
              )
            })}
          </g>
        )
      })}
    </g>
  )
})
