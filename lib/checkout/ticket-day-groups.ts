import { isFullPassDayId, normalizeDayId } from "@/lib/event-schedule"
import { formatEventDay } from "@/lib/format"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import type { ScheduleDay } from "@/types/events"

export type TicketDateMeta = {
  dateId: string | null
  isFullPass: boolean
}

export type TicketDayGroup = {
  dateId: string
  dateLabel: string
  tickets: TicketSelectorTier[]
}

export function resolveTicketDateMeta(tier: {
  dayId?: string | null
  dateId?: string | null
  isFullPass?: boolean
}): TicketDateMeta {
  const raw = tier.dateId ?? tier.dayId
  const isFullPass = tier.isFullPass ?? isFullPassDayId(raw)
  return {
    dateId: isFullPass ? null : normalizeDayId(raw),
    isFullPass,
  }
}

export function ticketDateLabel(
  tier: {
    dayId?: string | null
    dateId?: string | null
    isFullPass?: boolean
  },
  scheduleDays: ScheduleDay[] = [],
): string {
  const meta = resolveTicketDateMeta(tier)
  if (meta.isFullPass) return "Todos los días"
  const day = scheduleDays.find((item) => item.id === meta.dateId)
  if (day) return day.title?.trim() || formatEventDay(day.start_time)
  return meta.dateId ?? "Fecha específica"
}

export const FULL_PASS_TAB_ID = "full_pass"

export function ticketMatchesTab(
  tier: TicketSelectorTier,
  activeTabId: string,
): boolean {
  const meta = resolveTicketDateMeta(tier)
  if (activeTabId === FULL_PASS_TAB_ID) return meta.isFullPass
  return meta.dateId === activeTabId
}

export function groupTicketsByDate(
  tiers: TicketSelectorTier[],
  scheduleDays: ScheduleDay[] = [],
): {
  fullPassTickets: TicketSelectorTier[]
  ticketsByDate: TicketDayGroup[]
} {
  const fullPassTickets: TicketSelectorTier[] = []
  const buckets = new Map<string, TicketDayGroup>()

  for (const day of scheduleDays) {
    buckets.set(day.id, {
      dateId: day.id,
      dateLabel: day.title?.trim() || formatEventDay(day.start_time),
      tickets: [],
    })
  }

  for (const tier of tiers) {
    const meta = resolveTicketDateMeta(tier)
    if (meta.isFullPass) {
      fullPassTickets.push(tier)
      continue
    }
    const dateId = meta.dateId ?? "sin-fecha"
    const existing = buckets.get(dateId)
    if (existing) {
      existing.tickets.push(tier)
      continue
    }
    buckets.set(dateId, {
      dateId,
      dateLabel: ticketDateLabel(tier, scheduleDays),
      tickets: [tier],
    })
  }

  return {
    fullPassTickets,
    ticketsByDate: [...buckets.values()].filter((group) => group.tickets.length > 0),
  }
}
