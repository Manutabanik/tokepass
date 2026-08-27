import { expandDraftTicketsForSchedule } from "@/lib/events/draft-schedule-bindings"
import { flattenDraftScheduleOccurrences } from "@/lib/events/draft-schedule-slots-v2"
import {
  assertPublishedSeatedTicketsBoundToDays,
  buildPublishEventV2Payload,
  sanitizePublishPayloadForDatabase,
  type PublishEventV2Payload,
  type PublishEventV2SeatingMap,
} from "@/lib/events/publish-event-v2"
import {
  rematchEventDraftTicketIds,
  type LiveTicketIdSnapshot,
} from "@/lib/events/sync-draft-ticket-ids-v2"
import type { EventFeeConfig } from "@/lib/pricing/event-fees"
import {
  eventPublishSchema,
  parseEventDraftV2,
  resolveDraftSchedule,
} from "@/lib/validations/event-draft-v2"

export function assertPublishedMapsMatchSchedule(
  maps: PublishEventV2SeatingMap[],
  scheduleDays: Array<{ id: string | null }>,
) {
  const dayIds = new Set(
    scheduleDays
      .map((day) => day.id?.trim() ?? "")
      .filter((id) => id.length > 0),
  )
  if (dayIds.size < 2) return
  for (const map of maps) {
    const id = map.event_date_id?.trim() ?? ""
    if (!id || !dayIds.has(id)) {
      throw new Error(
        "Cada mapa tiene que estar atado a una jornada del cronograma.",
      )
    }
  }
}

/**
 * Unique path from a validated draft + live ticket rows to the relational
 * publish payload. Expand, rematch, then fail closed if maps and days diverge.
 */
export function preparePublishDraftV2(input: {
  draft: unknown
  liveTickets?: LiveTicketIdSnapshot[]
  fee?: EventFeeConfig
}): PublishEventV2Payload {
  const published = eventPublishSchema.parse(input.draft)
  const draft = parseEventDraftV2(published)
  const occurrences = flattenDraftScheduleOccurrences(
    resolveDraftSchedule(draft),
  )
  const rematched = rematchEventDraftTicketIds(
    {
      ...draft,
      tickets: expandDraftTicketsForSchedule(draft.tickets, occurrences),
    },
    input.liveTickets ?? [],
  )
  const payload = sanitizePublishPayloadForDatabase(
    buildPublishEventV2Payload(rematched, input.fee),
  )
  assertPublishedMapsMatchSchedule(payload.seating_maps, payload.schedule_days)
  assertPublishedSeatedTicketsBoundToDays(payload.tickets, payload.schedule_days)
  return payload
}
