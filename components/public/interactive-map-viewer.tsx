"use client"

import {
  InteractiveSeatingCanvas,
  type InteractiveSelectedSeat,
} from "@/components/public/interactive-seating-canvas"
import { cn } from "@/lib/utils"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { InteractiveVenueMap, VenueMapZone } from "@/types/venue-map"

export function InteractiveMapViewer({
  map,
  eventId = null,
  occupancyBySeatId = {},
  priceBySectorId = {},
  pending = false,
  selectedZoneId = null,
  unavailableZoneIds = [],
  heldSeatIds = [],
  maxSelectable,
  onSelectZone,
  onContinue,
  className,
}: {
  map: InteractiveVenueMap
  eventId?: string | null
  occupancyBySeatId?: Record<string, SeatStatus>
  priceBySectorId?: Record<string, number>
  pending?: boolean
  selectedZoneId?: string | null
  unavailableZoneIds?: string[]
  heldSeatIds?: string[]
  maxSelectable?: number
  onSelectZone?: (zone: VenueMapZone) => void
  onContinue?: (seats: InteractiveSelectedSeat[]) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative h-[320px] w-full max-w-[100vw] overflow-hidden rounded-xl border border-border/70 bg-background/50",
        "touch-none md:h-[450px] md:touch-auto",
        className,
      )}
    >
      <BuyerMapGrid isEditMode={false} />
      <InteractiveSeatingCanvas
        map={map}
        eventId={eventId}
        occupancyBySeatId={occupancyBySeatId}
        priceBySectorId={priceBySectorId}
        pending={pending}
        selectedZoneId={selectedZoneId}
        unavailableZoneIds={unavailableZoneIds}
        heldSeatIds={heldSeatIds}
        maxSelectable={maxSelectable}
        onSelectZone={onSelectZone}
        onContinue={onContinue ?? (() => {})}
        fillParent
        disableIdlePrompt
        hideChrome
        hideToolbar
        buyerChrome
      />
    </div>
  )
}

/** Cuadrícula técnica del Studio. En checkout / cliente no se dibuja. */
function BuyerMapGrid({ isEditMode = false }: { isEditMode?: boolean }) {
  if (!isEditMode) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:28px_28px]"
    />
  )
}
