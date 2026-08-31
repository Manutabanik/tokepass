"use client"

import { Maximize2 } from "lucide-react"
import { useEffect, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { AdaptiveSeatingFlow } from "@/components/public/adaptive-seating-flow"
import type {
  UniversalSeatSelection,
  UniversalSector,
  SeatStatus,
} from "@/lib/seating/universal-seat-types"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap, VenueMapZone } from "@/types/venue-map"

export function SeatSelectionSplitMap({
  map,
  eventId,
  eventTitle,
  pending,
  maxSelectable,
  selectedZoneId,
  unavailableZoneIds,
  occupancyBySeatId,
  heldSeatIds,
  priceBySectorId,
  sectors,
  expanded,
  onExpandedChange,
  onSelectZone,
  onContinue,
}: {
  map: InteractiveVenueMap | null
  eventId?: string | null
  eventTitle: string
  pending: boolean
  maxSelectable?: number | null
  selectedZoneId: string | null
  unavailableZoneIds: string[]
  occupancyBySeatId: Record<string, SeatStatus>
  heldSeatIds?: string[]
  priceBySectorId: Record<string, number>
  sectors: UniversalSector[]
  expanded: boolean
  onExpandedChange: (open: boolean) => void
  onSelectZone: (zone: VenueMapZone) => void
  onContinue: (selection: UniversalSeatSelection) => void
}) {
  const portalReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  useEffect(() => {
    if (!expanded) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        onExpandedChange(false)
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [expanded, onExpandedChange])

  const mapFlow = (compact: boolean) =>
    map ? (
      <AdaptiveSeatingFlow
        immersive
        compact={compact}
        toolbarTitle={compact ? null : "Mapa del recinto"}
        onCloseMap={compact ? undefined : () => onExpandedChange(false)}
        pending={pending}
        maxSelectable={maxSelectable}
        eventId={eventId}
        eventTitle={eventTitle}
        venueMap={map}
        selectedZoneId={selectedZoneId}
        unavailableZoneIds={unavailableZoneIds}
        occupancyBySeatId={occupancyBySeatId}
        heldSeatIds={heldSeatIds}
        priceBySectorId={priceBySectorId}
        sectors={sectors}
        onSelectZone={onSelectZone}
        onContinue={onContinue}
      />
    ) : (
      <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        El plano no está disponible.
      </p>
    )

  return (
    <>
      <div className="relative h-[min(35vh,13.5rem)] shrink-0 overflow-hidden border-b border-border bg-background/50 sm:h-64">
        <div className="h-full min-h-0 w-full">{mapFlow(true)}</div>
        {map ? (
          <button
            type="button"
            onClick={() => onExpandedChange(true)}
            aria-haspopup="dialog"
            aria-expanded={expanded}
            className={cn(
              "absolute right-3 bottom-3 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full",
              "bg-background/90 px-3 py-2 text-xs font-bold text-foreground shadow-sm backdrop-blur-sm",
              "transition-all duration-200 hover:bg-background",
            )}
          >
            <Maximize2 className="size-3.5" aria-hidden="true" />
            Ampliar Mapa
          </button>
        ) : null}
      </div>

      {portalReady && expanded && map
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex h-[100dvh] items-center justify-center overflow-hidden bg-background"
              role="dialog"
              aria-modal="true"
              aria-label="Mapa del recinto"
            >
              <div className="flex h-full min-h-0 w-full flex-col bg-background/50">
                <div className="min-h-0 flex-1 bg-background/50">{mapFlow(false)}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
