"use client"

import { Copy, MapPinned, MoreHorizontal, PenTool, Trash2 } from "lucide-react"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { DRAFT_FIELD_CLASS, DraftCard, DraftHint } from "./event-editor-v2-ui"
import { InteractiveVenueMapStudio } from "@/components/admin/interactive-venue-map-studio"
import { VenueMapStudioSummary } from "@/components/admin/venue-map-studio-summary"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { datePartFromDateTime } from "@/lib/events/draft-schedule-slots-v2"
import {
  cloneDraftSeatingMapInstance,
  collectDraftLiveSectors,
  collectDraftLiveSectorIds,
  configuredDraftSeatingMapDateIds,
  draftHasActiveSeatingMap,
  emptyDraftSeatingMap,
  hasDraftSeatingMapContent,
  mergeDraftTicketsWithDayMap,
  mergeDraftTicketsWithScheduleMaps,
  parseDraftSeatingMaps,
  removeDraftSeatingMapInstance,
  removeSeatedDraftTicketsForDay,
  sanitizeDraftTicketsForPersist,
  seatingInstanceToVenueMap,
  toDraftSeatingMap,
  upsertDraftSeatingMapInstance,
} from "@/lib/events/draft-seating-map-v2"
import { isMapDraftTicket, type EventDraftV2 } from "@/lib/validations/event-draft-v2"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function EventEditorV2SeatingMap({
  eventId,
  embedded = false,
}: {
  eventId: string
  embedded?: boolean
}) {
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
  const currentMaps = seatingMaps
  const configuredDays = configuredDraftSeatingMapDateIds(currentMaps)
  const activeDay = days.find((day) => day.id === openDateId) ?? days[0]
  const activeInstance = currentMaps.find(
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
    writeSeatingMaps(nextMaps)
    const stableMap =
      seatingInstanceToVenueMap(
        nextMaps.find((item) => item.dateId === dateId),
      ) || next
    const scheduleDayIds = (getValues("schedule") ?? [])
      .map((day) => day.id)
      .filter(Boolean)
    const liveSectors = collectDraftLiveSectors({
      seatingMaps: nextMaps,
      seatingMap: nextMaps[0]?.mapConfig,
    })
    setValue(
      "tickets",
      sanitizeDraftTicketsForPersist(
        mergeDraftTicketsWithScheduleMaps(
          getValues("tickets") ?? [],
          stableMap,
          dateId,
          scheduleDayIds,
          nextMaps,
        ),
        {
          mapActive: draftHasActiveSeatingMap({
            seatingMaps: nextMaps,
            seatingMap: nextMaps[0]?.mapConfig,
          }),
          liveSectorIds: collectDraftLiveSectorIds({
            seatingMaps: nextMaps,
            seatingMap: nextMaps[0]?.mapConfig,
          }),
          liveSectors,
        },
      ),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  function writeSeatingMaps(
    nextMaps: ReturnType<typeof parseDraftSeatingMaps>,
  ) {
    setValue("seatingMaps", nextMaps, { shouldDirty: true, shouldTouch: true })
    setValue(
      "seatingMap",
      toDraftSeatingMap(nextMaps[0]?.mapConfig ?? emptyDraftSeatingMap()),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  function handleCloneMap(sourceDateId: string, targetDateId: string) {
    if (!sourceDateId || !targetDateId || sourceDateId === targetDateId) return
    const maps = parseDraftSeatingMaps(
      getValues("seatingMaps"),
      getValues("seatingMap"),
      targetDateId,
    )
    const source = maps.find((item) => item.dateId === sourceDateId)
    if (!source || !hasDraftSeatingMapContent(source.mapConfig)) return
    const cloned = cloneDraftSeatingMapInstance(source, targetDateId)
    const nextMaps = maps.some((item) => item.dateId === targetDateId)
      ? maps.map((item) => (item.dateId === targetDateId ? cloned : item))
      : [...maps, cloned]
    writeSeatingMaps(nextMaps)
    const liveSectors = collectDraftLiveSectors({
      seatingMaps: nextMaps,
      seatingMap: nextMaps[0]?.mapConfig,
    })
    setValue(
      "tickets",
      sanitizeDraftTicketsForPersist(
        mergeDraftTicketsWithDayMap(
          getValues("tickets") ?? [],
          seatingInstanceToVenueMap(cloned),
          targetDateId,
        ),
        {
          mapActive: draftHasActiveSeatingMap({
            seatingMaps: nextMaps,
            seatingMap: nextMaps[0]?.mapConfig,
          }),
          liveSectorIds: collectDraftLiveSectorIds({
            seatingMaps: nextMaps,
            seatingMap: nextMaps[0]?.mapConfig,
          }),
          liveSectors,
        },
      ),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  function handleRemoveDayMap(dateId: string) {
    const day = dateId.trim()
    const maps = parseDraftSeatingMaps(
      getValues("seatingMaps"),
      getValues("seatingMap"),
      day,
    )
    const nextMaps = removeDraftSeatingMapInstance(maps, day)
    writeSeatingMaps(nextMaps)
    const liveSectors = collectDraftLiveSectors({
      seatingMaps: nextMaps,
      seatingMap: nextMaps[0]?.mapConfig,
    })
    setValue(
      "tickets",
      sanitizeDraftTicketsForPersist(
        removeSeatedDraftTicketsForDay(getValues("tickets") ?? [], day),
        {
          mapActive: draftHasActiveSeatingMap({
            seatingMaps: nextMaps,
            seatingMap: nextMaps[0]?.mapConfig,
          }),
          liveSectorIds: collectDraftLiveSectorIds({
            seatingMaps: nextMaps,
            seatingMap: nextMaps[0]?.mapConfig,
          }),
          liveSectors,
        },
      ),
      { shouldDirty: true, shouldTouch: true },
    )
    if (openDateId === dateId) setOpenDateId(null)
  }

  const body = (
    <>
      <div className={embedded ? "mb-3" : "mb-4"}>
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-100">
          <MapPinned className="size-4 text-emerald-400" aria-hidden />
          Mapas por jornada
        </h2>
        <DraftHint>
          Cada día puede tener su propio plano, precios y bloqueos. Si ya
          dibujaste uno, podés clonarlo y ajustar solo los precios del nuevo
          día.
        </DraftHint>
      </div>

      <ul className={embedded ? "divide-y divide-border/50" : "space-y-4"}>
        {days.map((day, index) => {
          const dateId = day.id || ""
          const instance = currentMaps.find((item) => item.dateId === dateId)
          const map = seatingInstanceToVenueMap(instance)
          const label = dayMapLabel(day, index)
          const hasMap = hasDraftSeatingMapContent(instance?.mapConfig)
          const sourceDays = configuredDays.filter((id) => id !== dateId)
          return (
            <li
              key={dateId || `day-${index}`}
              className={
                embedded
                  ? "py-3 first:pt-0 last:pb-0"
                  : "rounded-2xl border border-border/60 p-3 sm:p-4"
              }
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold text-slate-800 dark:text-zinc-100">
                  {label}
                </p>
                {hasMap ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      type="button"
                      aria-label={`Opciones del mapa de ${label}`}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleRemoveDayMap(dateId)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Eliminar mapa de esta jornada
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              {hasMap ? (
                <VenueMapStudioSummary
                  map={map}
                  openLabel={`Editar mapa para ${label}`}
                  onOpen={() => setOpenDateId(dateId)}
                />
              ) : (
                <EmptyDayMapActions
                  dateId={dateId}
                  label={label}
                  sourceDays={sourceDays.map((id) => ({
                    id,
                    label: dayLabelById(days, id),
                  }))}
                  onClone={(sourceDateId) => handleCloneMap(sourceDateId, dateId)}
                  onDraw={() => setOpenDateId(dateId)}
                />
              )}
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
    </>
  )

  if (embedded) {
    return <section className="w-full min-w-0">{body}</section>
  }

  return <DraftCard className="w-full">{body}</DraftCard>
}

function EmptyDayMapActions({
  dateId,
  label,
  sourceDays,
  onClone,
  onDraw,
}: {
  dateId: string
  label: string
  sourceDays: Array<{ id: string; label: string }>
  onClone: (sourceDateId: string) => void
  onDraw: () => void
}) {
  const [sourceDateId, setSourceDateId] = useState(sourceDays[0]?.id ?? "")
  const selected =
    sourceDays.some((day) => day.id === sourceDateId)
      ? sourceDateId
      : (sourceDays[0]?.id ?? "")

  if (sourceDays.length === 0) {
    return (
      <Button
        type="button"
        onClick={onDraw}
        className="bg-primary hover:bg-primary/90 h-12 w-full rounded-xl font-bold text-primary-foreground"
      >
        <PenTool className="size-4" aria-hidden />
        Diseñar mapa desde cero
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="grid min-w-0 flex-1 gap-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
            Copiar de
          </span>
          <select
            aria-label={`Copiar mapa hacia ${label}`}
            value={selected}
            onChange={(event) => setSourceDateId(event.target.value)}
            className={DRAFT_FIELD_CLASS}
          >
            {sourceDays.map((day) => (
              <option key={day.id} value={day.id}>
                {day.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={!selected || !dateId}
          onClick={() => onClone(selected)}
          className="bg-primary hover:bg-primary/90 h-12 shrink-0 rounded-xl px-5 font-bold text-primary-foreground"
        >
          <Copy className="size-4" aria-hidden />
          Clonar diseño
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onDraw}
        className="h-12 rounded-xl font-medium"
      >
        <PenTool className="size-4" aria-hidden />
        Dibujar desde cero
      </Button>
    </div>
  )
}

function dayMapLabel(
  day: { id?: string; name?: string; date?: string; startDate?: string },
  index: number,
) {
  const name = day.name?.trim() || `Día ${index + 1}`
  const date = datePartFromDateTime(day.startDate || day.date || "")
  return date ? `${name} · ${date}` : name
}

function dayLabelById(
  days: Array<{ id?: string; name?: string; date?: string; startDate?: string }>,
  dateId: string,
) {
  const index = days.findIndex((day) => day.id === dateId)
  const day = index >= 0 ? days[index] : undefined
  return day ? dayMapLabel(day, index) : "Día configurado"
}