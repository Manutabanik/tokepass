"use client"

import { LoaderCircle } from "lucide-react"

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
  immersive = false,
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
  immersive?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        immersive
          ? "relative flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-black/90"
          : "relative h-[320px] w-full max-w-[100vw] overflow-hidden rounded-xl border border-border/70 bg-background/50 touch-none md:h-[450px] md:touch-auto",
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
        zoomDockClassName={immersive ? "bottom-3" : undefined}
        lodBackClassName={immersive ? "top-3" : undefined}
      />
      {pending ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/55">
          <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}
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
