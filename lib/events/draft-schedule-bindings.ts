import {
  flattenDraftScheduleOccurrences,
  type DraftScheduleOccurrence,
  type EventDraftV2ScheduleDay,
} from "@/lib/events/draft-schedule-slots-v2"

type DayBoundTicket = {
  id?: string
  source?: string
  slotId?: string
  validDayIds?: string[]
}

function liveScheduleIds(schedule: EventDraftV2ScheduleDay[]): Set<string> {
  const ids = new Set<string>()
  for (const day of schedule) {
    const dayId = day.id?.trim()
    if (dayId) ids.add(dayId)
    for (const slot of day.slots ?? []) {
      const slotId = slot.id?.trim()
      if (slotId) ids.add(slotId)
    }
  }
  return ids
}

export function occurrenceIdsForDraftTicket(
  ticket: { slotId?: string; validDayIds?: string[] },
  occurrences: DraftScheduleOccurrence[],
): string[] {
  const slot = ticket.slotId?.trim() ?? ""
  if (slot) {
    const fromSlot = occurrences.filter(
      (occurrence) => occurrence.id === slot || occurrence.dayId === slot,
    )
    if (fromSlot.length > 0) {
      return [...new Set(fromSlot.map((occurrence) => occurrence.id))]
    }
  }
  const valid = (ticket.validDayIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  if (valid.length !== 1) return []
  return [
    ...new Set(
      occurrences
        .filter(
          (occurrence) =>
            occurrence.dayId === valid[0] || occurrence.id === valid[0],
        )
        .map((occurrence) => occurrence.id),
    ),
  ]
}

/** One draft ticket per published slot when a day chip covers several turnos. */
export function expandDraftTicketsForSchedule<T extends DayBoundTicket>(
  tickets: T[],
  occurrences: DraftScheduleOccurrence[],
): T[] {
  return tickets.flatMap((ticket) => {
    const ids = occurrenceIdsForDraftTicket(ticket, occurrences)
    if (ids.length <= 1) return [ticket]
    return ids.map((occId, index) => ({
      ...ticket,
      id: index === 0 ? ticket.id : `${ticket.id}:${occId}`,
      slotId: occId,
      validDayIds: [occId],
    }))
  })
}

export function pruneDraftScheduleBindings<
  T extends {
    schedule?: EventDraftV2ScheduleDay[]
    tickets?: DayBoundTicket[]
    extras?: DayBoundTicket[]
    seatingMaps?: Array<{ dateId?: string }> | null
  },
>(draft: T): T {
  const schedule = draft.schedule ?? []
  const live = liveScheduleIds(schedule)
  if (live.size === 0) return draft
  const occurrences = flattenDraftScheduleOccurrences(schedule)

  function pruneTicket<L extends DayBoundTicket>(ticket: L): L | null {
    const slotId = ticket.slotId?.trim() ?? ""
    const valid = (ticket.validDayIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && live.has(id))
    const nextSlot = slotId && live.has(slotId) ? slotId : ""
    const next = {
      ...ticket,
      slotId: nextSlot,
      validDayIds: valid,
    }
    if (ticket.source === "map") {
      const remaining = occurrenceIdsForDraftTicket(next, occurrences)
      if (remaining.length === 0 && (slotId || (ticket.validDayIds ?? []).length > 0)) {
        return null
      }
    }
    return next
  }

  return {
    ...draft,
    seatingMaps: (draft.seatingMaps ?? []).filter((item) => {
      const dateId = item.dateId?.trim() ?? ""
      return !dateId || live.has(dateId)
    }),
    tickets: (draft.tickets ?? [])
      .map((ticket) => pruneTicket(ticket))
      .filter((ticket): ticket is DayBoundTicket => ticket != null) as T["tickets"],
    extras: (draft.extras ?? [])
      .map((ticket) => pruneTicket(ticket))
      .filter((ticket): ticket is DayBoundTicket => ticket != null) as T["extras"],
  }
}
