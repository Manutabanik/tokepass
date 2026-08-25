"use client"

import { MapPinned } from "lucide-react"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { DraftCard, DraftHint } from "./event-editor-v2-ui"
import { InteractiveVenueMapStudio } from "@/components/admin/interactive-venue-map-studio"
import { VenueMapStudioSummary } from "@/components/admin/venue-map-studio-summary"
import {
  draftSeatingMapToVenueMap,
  mergeDraftTicketsWithMap,
  toDraftSeatingMap,
} from "@/lib/events/draft-seating-map-v2"
import { isMapDraftTicket, type EventDraftV2 } from "@/lib/validations/event-draft-v2"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function EventEditorV2SeatingMap({ eventId }: { eventId: string }) {
  const { control, getValues, setValue } = useFormContext<EventDraftV2>()
  const [open, setOpen] = useState(false)
  const seatingMap = useWatch({ control, name: "seatingMap" })
  const tickets = useWatch({ control, name: "tickets" }) ?? []
  const title = useWatch({ control, name: "basicInfo.name" })
  const scheduleStart = useWatch({ control, name: "schedule.0.startDate" })
  const basicStart = useWatch({ control, name: "basicInfo.startDate" })
  const startDate = scheduleStart || basicStart
  const venueName = useWatch({ control, name: "location.venueName" })
  const map = draftSeatingMapToVenueMap(seatingMap)

  function persistMapOnly(next: InteractiveVenueMap) {
    setValue("seatingMap", toDraftSeatingMap(next), {
      shouldDirty: true,
      shouldTouch: true,
    })
  }

  function persistMapAndTickets(next: InteractiveVenueMap) {
    persistMapOnly(next)
    setValue(
      "tickets",
      mergeDraftTicketsWithMap(getValues("tickets") ?? [], next),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  return (
    <DraftCard className="md:col-span-12">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-100">
          <MapPinned className="size-4 text-emerald-400" aria-hidden />
          Mapa de asientos
        </h2>
        <DraftHint>
          Opcional. El plano y sus sectores viven en el JSON del borrador. Las
          entradas generales no se tocan.
        </DraftHint>
      </div>

      <VenueMapStudioSummary map={map} onOpen={() => setOpen(true)} />

      <InteractiveVenueMapStudio
        open={open}
        eventTitle={title?.trim() || "Evento"}
        eventDate={startDate || undefined}
        venueLabel={venueName || undefined}
        value={map}
        tickets={tickets.filter(isMapDraftTicket).map((ticket) => ({
          id: ticket.id,
          name: ticket.name,
          price: ticket.price,
          seatingSectorId: ticket.sectorId,
          layoutType: ticket.layoutType,
        }))}
        eventId={eventId}
        onClose={() => setOpen(false)}
        onChange={persistMapAndTickets}
        onSave={(next) => {
          persistMapAndTickets(next)
          setOpen(false)
        }}
      />
    </DraftCard>
  )
}
