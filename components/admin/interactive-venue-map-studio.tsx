"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { BuyerViewModal } from "@/components/admin/buyer-view-modal"
import { InteractiveVenueMapEditor } from "@/components/admin/interactive-venue-map-editor"
import { venueMapToSeatingLayout } from "@/lib/seating/venue-map-geometry"
import { parseVenueMap, type InteractiveVenueMap } from "@/types/venue-map"
import type { VenueSeatingLayout } from "@/types/venues"

export function InteractiveVenueMapStudio({
  open,
  eventTitle,
  eventDate,
  venueLabel,
  value,
  onSave,
  onClose,
  saving = false,
}: {
  open: boolean
  eventTitle: string
  eventDate?: string
  venueLabel?: string
  value: InteractiveVenueMap
  onSave: (map: InteractiveVenueMap, layout: VenueSeatingLayout) => void
  onClose: () => void
  saving?: boolean
}) {
  const [draft, setDraft] = useState(() => parseVenueMap(value))
  const [preview, setPreview] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    setDraft(parseVenueMap(value))
    setPreview(false)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open, value])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden bg-background">
      <InteractiveVenueMapEditor
        variant="studio"
        eventTitle={eventTitle}
        value={draft}
        saving={saving}
        onChange={(next) => setDraft(next)}
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
