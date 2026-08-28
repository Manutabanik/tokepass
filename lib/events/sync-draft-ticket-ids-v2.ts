import { isMapDraftTicket } from "@/lib/events/draft-seating-map-v2"
import { asPublishScheduleId } from "@/lib/events/publish-event-v2"
import type { EventDraftV2, EventDraftV2LineItem } from "@/lib/validations/event-draft-v2"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type LiveTicketIdSnapshot = {
  id: string
  name: string | null
  seating_sector_id: string | null
  day_id?: string | null
  ticket_type?: string | null
  tier_type?: string | null
}

function draftTicketDayId(ticket: EventDraftV2LineItem): string {
  return (ticket.slotId || ticket.validDayIds?.[0] || "").trim()
}

function liveTicketDayId(row: LiveTicketIdSnapshot): string {
  return (row.day_id ?? "").trim()
}

function sameDay(draftDay: string, liveDay: string): boolean {
  if (!draftDay && !liveDay) return true
  if (!draftDay || !liveDay) return false
  if (draftDay === liveDay) return true
  const published = asPublishScheduleId(draftDay)
  return Boolean(published && published === liveDay)
}

function liveIsExtra(row: LiveTicketIdSnapshot): boolean {
  return row.ticket_type === "extra" || row.tier_type === "addon"
}

function liveIsSeated(row: LiveTicketIdSnapshot): boolean {
  return (
    row.tier_type === "seated" ||
    Boolean((row.seating_sector_id ?? "").trim())
  )
}

/**
 * After the first preview/publish, live `ticket_tiers` get real UUIDs while
 * the draft can still hold `map:{date}:{sector}` stubs. Rematch so the next
 * publish updates those rows instead of deleting and recreating them.
 */
export function rematchDraftTicketIds(
  draftTickets: EventDraftV2LineItem[],
  live: LiveTicketIdSnapshot[],
  kind: "ticket" | "extra" = "ticket",
): EventDraftV2LineItem[] {
  const unused = live.filter((row) => UUID_RE.test(row.id))
  const claimed = new Set<string>()

  function take(
    match: (row: LiveTicketIdSnapshot) => boolean,
  ): string | null {
    const found = unused.find((row) => !claimed.has(row.id) && match(row))
    if (!found) return null
    claimed.add(found.id)
    return found.id
  }

  return draftTickets.map((ticket) => {
    const rematchedRates = rematchDayRates(ticket, unused, claimed)
    if (UUID_RE.test(ticket.id)) {
      const liveHit = unused.find((row) => row.id === ticket.id)
      if (liveHit) {
        claimed.add(ticket.id)
        return rematchedRates
      }
    }

    const sector = (ticket.sectorId ?? "").trim()
    const day = draftTicketDayId(ticket)
    const name = ticket.name.trim().toLowerCase()
    const isMap = isMapDraftTicket(ticket) || Boolean(sector)

    const matched =
      kind === "extra"
        ? take((row) => {
            if (!liveIsExtra(row) || liveIsSeated(row)) return false
            if ((row.name ?? "").trim().toLowerCase() !== name) return false
            return sameDay(day, liveTicketDayId(row))
          })
        : isMap
          ? take((row) => {
              if (liveIsExtra(row)) return false
              const rowSector = (row.seating_sector_id ?? "").trim()
              if (sector && rowSector !== sector) return false
              if (!sector && rowSector) return false
              if (!sameDay(day, liveTicketDayId(row))) return false
              const rowName = (row.name ?? "").trim().toLowerCase()
              if (sector && rowSector === sector) return true
              return Boolean(name) && rowName === name
            })
          : take((row) => {
              if (liveIsSeated(row) || liveIsExtra(row)) return false
              if ((row.name ?? "").trim().toLowerCase() !== name) return false
              return sameDay(day, liveTicketDayId(row))
            })

    if (!matched) return rematchedRates
    return { ...rematchedRates, id: matched }
  })
}

function rematchDayRates(
  ticket: EventDraftV2LineItem,
  unused: LiveTicketIdSnapshot[],
  claimed: Set<string>,
): EventDraftV2LineItem {
  const rates = ticket.dayRates ?? []
  if (rates.length === 0) return ticket
  const family = ticket.name.trim().toLowerCase()
  const nextRates = rates.map((rate) => {
    const existing = rate.ticketId.trim()
    if (existing && UUID_RE.test(existing)) {
      const liveHit = unused.find((row) => row.id === existing)
      if (liveHit) {
        claimed.add(existing)
        return rate
      }
    }
    const day = rate.dayId.trim()
    const found = unused.find((row) => {
      if (claimed.has(row.id) || liveIsSeated(row) || liveIsExtra(row)) {
        return false
      }
      if (!sameDay(day, liveTicketDayId(row))) return false
      const rowName = (row.name ?? "").trim().toLowerCase()
      return Boolean(family) && (rowName === family || rowName.startsWith(family))
    })
    if (!found) return rate
    claimed.add(found.id)
    return { ...rate, ticketId: found.id }
  })
  return {
    ...ticket,
    dayRates: nextRates,
    id: nextRates[0]?.ticketId?.trim() || ticket.id,
  }
}

export function rematchEventDraftTicketIds(
  draft: EventDraftV2,
  live: LiveTicketIdSnapshot[],
): EventDraftV2 {
  const tickets = rematchDraftTicketIds(draft.tickets, live, "ticket")
  const claimed = new Set(tickets.map((ticket) => ticket.id))
  const leftoverLive = live.filter((row) => !claimed.has(row.id))
  return {
    ...draft,
    tickets,
    extras: rematchDraftTicketIds(draft.extras, leftoverLive, "extra"),
  }
}
