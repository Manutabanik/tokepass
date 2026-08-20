"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { BuyerViewModal } from "@/components/admin/buyer-view-modal"
import { InteractiveVenueMapEditor } from "@/components/admin/interactive-venue-map-editor"
import { venueMapToSeatingLayout } from "@/lib/seating/venue-map-geometry"
import type { VenueMapSkuTicketRef } from "@/lib/seating/venue-map-sku-consistency"
import { parseVenueMap, type InteractiveVenueMap } from "@/types/venue-map"
import type { VenueSeatingLayout } from "@/types/venues"

export function InteractiveVenueMapStudio({
  open,
  eventTitle,
  eventDate,
  venueLabel,
  value,
  onSave,
  onChange,
  onAutoSave,
  onClose,
  saving = false,
  tickets,
}: {
  open: boolean
  eventTitle: string
  eventDate?: string
  venueLabel?: string
  value: InteractiveVenueMap
  onSave: (map: InteractiveVenueMap, layout: VenueSeatingLayout) => void
  onChange?: (map: InteractiveVenueMap) => void
  onAutoSave?: (map: InteractiveVenueMap) => void | Promise<void>
  onClose: () => void
  saving?: boolean
  tickets?: VenueMapSkuTicketRef[] | null
}) {
  const [draft, setDraft] = useState(() => parseVenueMap(value))
  const [preview, setPreview] = useState(false)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const [openSeen, setOpenSeen] = useState(open)
  if (open !== openSeen) {
    setOpenSeen(open)
    if (open) {
      setDraft(parseVenueMap(value))
      setPreview(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior
    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    return () => {
      document.body.style.overflow = previous
      document.body.style.overscrollBehavior = previousOverscroll
    }
  }, [open])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col overflow-hidden overscroll-none bg-background text-foreground">
      <InteractiveVenueMapEditor
        variant="studio"
        eventTitle={eventTitle}
        value={draft}
        saving={saving}
        tickets={tickets}
        onChange={(next) => {
          setDraft(next)
          onChange?.(next)
        }}
        onAutoSave={async (map) => {
          setDraft(map)
          if (onAutoSave) {
            await onAutoSave(map)
            return
          }
          onChange?.(map)
        }}
        onPreview={() => setPreview(true)}
        onSave={(map) => onSave(map, venueMapToSeatingLayout(map))}
        onClose={onClose}
      />
      <BuyerViewModal
        open={preview}
        map={draft}
        eventTitle={eventTitle}
        eventDate={eventDate}
        venueLabel={venueLabel}
        onClose={() => setPreview(false)}
      />
    </div>,
    document.body,
  )
}
