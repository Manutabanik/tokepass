"use client"

import { MapPinned } from "lucide-react"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { DraftCard, DraftHint } from "./event-editor-v2-ui"
import { InteractiveVenueMapStudio } from "@/components/admin/interactive-venue-map-studio"
import { VenueMapStudioSummary } from "@/components/admin/venue-map-studio-summary"
import { datePartFromDateTime } from "@/lib/events/draft-schedule-slots-v2"
import {
  mergeDraftTicketsWithDayMap,
  parseDraftSeatingMaps,
  seatingInstanceToVenueMap,
  toDraftSeatingMap,
  upsertDraftSeatingMapInstance,
} from "@/lib/events/draft-seating-map-v2"
import { isMapDraftTicket, type EventDraftV2 } from "@/lib/validations/event-draft-v2"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function EventEditorV2SeatingMap({ eventId }: { eventId: string }) {
  const { control, getValues, setValue } = useFormContext<EventDraftV2>()
  const [openDateId, setOpenDateId] = useState<string | null>(null)
  const seatingMaps = useWatch({ control, name: "seatingMaps" }) ?? []
  const tickets = useWatch({ control, name: "tickets" }) ?? []
  const title = useWatch({ control, name: "basicInfo.name" })
  const venueName = useWatch({ control, name: "location.venueName" })
  const schedule = useWatch({ control, name: "schedule" }) ?? []
  const days =
    schedule.length > 0
      ? schedule
      : [
          {
            id: "",
            name: "Evento",
            date: "",
            startDate: "",
            endDate: "",
            slots: [],
          },
        ]
  const activeDay = days.find((day) => day.id === openDateId) ?? days[0]
  const activeInstance = seatingMaps.find(
    (item) => item.dateId === (openDateId ?? ""),
  )
  const activeMap = seatingInstanceToVenueMap(activeInstance)

  function persistDayMap(dateId: string, next: InteractiveVenueMap) {
    const nextMaps = upsertDraftSeatingMapInstance(
      parseDraftSeatingMaps(
        getValues("seatingMaps"),
        getValues("seatingMap"),
        dateId,
      ),
      dateId,
      next,
    )
    setValue("seatingMaps", nextMaps, { shouldDirty: true, shouldTouch: true })
    setValue("seatingMap", toDraftSeatingMap(nextMaps[0]?.mapConfig ?? next), {
      shouldDirty: true,
      shouldTouch: true,
    })
    setValue(
      "tickets",
      mergeDraftTicketsWithDayMap(getValues("tickets") ?? [], next, dateId),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  return (
    <DraftCard className="lg:col-span-12">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-100">
          <MapPinned className="size-4 text-emerald-400" aria-hidden />
          Mapas por jornada
        </h2>
        <DraftHint>
          Cada día puede tener su propio plano, precios y bloqueos. El JSON
          guarda una instancia en <code>seatingMaps</code> ligada al{" "}
          <code>dateId</code> de la jornada.
        </DraftHint>
      </div>

      <ul className="space-y-4">
        {days.map((day, index) => {
          const dateId = day.id || ""
          const instance = seatingMaps.find((item) => item.dateId === dateId)
          const map = seatingInstanceToVenueMap(instance)
          const label = dayMapLabel(day, index)
          return (
            <li
              key={dateId || `day-${index}`}
              className="rounded-2xl border border-border/60 p-3 sm:p-4"
            >
              <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-zinc-100">
                {label}
              </p>
              <VenueMapStudioSummary
                map={map}
                openLabel={`Configurar mapa para ${label}`}
                onOpen={() => setOpenDateId(dateId)}
              />
            </li>
          )
        })}
      </ul>

      <InteractiveVenueMapStudio
        open={openDateId != null}
        eventTitle={title?.trim() || "Evento"}
        eventDate={activeDay?.startDate || activeDay?.date || undefined}
        venueLabel={venueName || undefined}
        value={activeMap}
        tickets={tickets
          .filter(
            (ticket) =>
              isMapDraftTicket(ticket) &&
              (!openDateId ||
                (ticket.validDayIds ?? []).includes(openDateId) ||
                ticket.id.startsWith(`map:${openDateId}:`)),
          )
          .map((ticket) => ({
            id: ticket.id,
            name: ticket.name,
            price: ticket.price,
            seatingSectorId: ticket.sectorId,
            layoutType: ticket.layoutType,
          }))}
        eventId={eventId}
        onClose={() => setOpenDateId(null)}
        onChange={(next) => {
          if (openDateId == null) return
          persistDayMap(openDateId, next)
        }}
        onSave={(next) => {
          if (openDateId == null) return
          persistDayMap(openDateId, next)
          setOpenDateId(null)
        }}
      />
    </DraftCard>
  )
}

function dayMapLabel(
  day: { name?: string; date?: string; startDate?: string },
  index: number,
) {
  const name = day.name?.trim() || `Día ${index + 1}`
  const date = datePartFromDateTime(day.startDate || day.date || "")
  return date ? `${name} · ${date}` : name
}
