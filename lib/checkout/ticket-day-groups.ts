import { isFullPassDayId, normalizeDayId } from "@/lib/event-schedule"
import { isComboOrPassOffer } from "@/lib/checkout/ticket-offer-kind"
import { isDaySpecificTicket } from "@/lib/inventory/day-ticket-coverage"
import {
  formatEventCartDate,
  formatEventDay,
  formatEventDayNumber,
  formatEventMonthShort,
  formatEventWeekdayShort,
} from "@/lib/format"
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
  if (meta.isFullPass) return scheduleDays.length > 1 ? "Todos los días" : ""
  const day =
    scheduleDays.find((item) => item.id === meta.dateId) ??
    (scheduleDays.length === 1 ? scheduleDays[0] : undefined)
  if (day) return formatEventDay(day.start_time) || day.title?.trim() || ""
  return ""
}

/** Encabezado de sección: fecha calendario del día, no el título interno. */
export function ticketDateSectionLabel(
  dateId: string | null | undefined,
  scheduleDays: ScheduleDay[] = [],
): string {
  const day = scheduleDays.find((item) => item.id === dateId)
  if (!day) return ""
  return formatEventDay(day.start_time) || day.title?.trim() || ""
}

/** Badge en tarjeta: null si no hay fecha útil (evento de un solo día sin day_id). */
export function ticketDayBadgeLabel(
  tier: {
    dayId?: string | null
    dateId?: string | null
    isFullPass?: boolean
  },
  scheduleDays: ScheduleDay[] = [],
): string | null {
  const meta = resolveTicketDateMeta(tier)
  if (meta.isFullPass) {
    return scheduleDays.length > 1 ? "Todos los días" : null
  }
  const day = scheduleDays.find((item) => item.id === meta.dateId)
  if (day) return formatEventCartDate(day.start_time)
  const label = ticketDateLabel(tier, scheduleDays)
  return label || null
}

/** Etiqueta corta para carrito y checkout: "Jue 12 Nov". */
export function ticketDateCartLabel(
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
  if (day) return formatEventCartDate(day.start_time)
  return ticketDateLabel(tier, scheduleDays)
}

export function scheduleDayCartLabel(
  dateId: string | null | undefined,
  scheduleDays: ScheduleDay[] = [],
): string {
  if (!dateId) return ""
  const day = scheduleDays.find((item) => item.id === dateId)
  return day ? formatEventCartDate(day.start_time) : ""
}

export const FULL_PASS_TAB_ID = "full_pass"

export type CheckoutKindTab = "days" | "passes"

export type CheckoutDateCard = {
  dateId: string
  weekday: string
  dayNumber: string
  month: string
}

export function checkoutDateCardParts(
  startTime: string | Date,
): Omit<CheckoutDateCard, "dateId"> {
  return {
    weekday: formatEventWeekdayShort(startTime),
    dayNumber: formatEventDayNumber(startTime),
    month: formatEventMonthShort(startTime),
  }
}

export function listCheckoutDateCards(
  scheduleDays: ScheduleDay[] = [],
  tiers: TicketSelectorTier[] = [],
): CheckoutDateCard[] {
  if (scheduleDays.length > 0) {
    return scheduleDays.map((day) => ({
      dateId: day.id,
      ...checkoutDateCardParts(day.start_time),
    }))
  }
  return listCheckoutDayTabs(scheduleDays, tiers).map((tab) => {
    const day = scheduleDays.find((item) => item.id === tab.dateId)
    const parts = day
      ? checkoutDateCardParts(day.start_time)
      : { weekday: "", dayNumber: "", month: "" }
    return {
      dateId: tab.dateId,
      weekday: parts.weekday,
      dayNumber: parts.dayNumber || tab.dateLabel,
      month: parts.month,
    }
  })
}

export function hasDaySpecificTickets(tiers: TicketSelectorTier[] = []): boolean {
  return tiers.some((tier) => isDaySpecificTicket(tier))
}

export function hasFullPassTickets(tiers: TicketSelectorTier[] = []): boolean {
  return tiers.some((tier) => isComboOrPassOffer(tier))
}

export function shouldShowCheckoutKindTabs(
  tiers: TicketSelectorTier[] = [],
  scheduleDays: ScheduleDay[] = [],
): boolean {
  const dayTabs = listCheckoutDayTabs(scheduleDays, tiers)
  return hasFullPassTickets(tiers) && hasDaySpecificTickets(tiers) && dayTabs.length >= 1
}

export function defaultCheckoutKindTab(
  tiers: TicketSelectorTier[] = [],
): CheckoutKindTab {
  if (hasDaySpecificTickets(tiers)) return "days"
  if (hasFullPassTickets(tiers)) return "passes"
  return "days"
}

export function defaultCheckoutDateId(
  cards: CheckoutDateCard[],
  tiers: TicketSelectorTier[] = [],
): string | null {
  const withTickets = cards.find((card) =>
    tiers.some((tier) => ticketMatchesTab(tier, card.dateId)),
  )
  return withTickets?.dateId ?? cards[0]?.dateId ?? null
}

export function ticketMatchesTab(
  tier: TicketSelectorTier,
  activeTabId: string,
  options?: { treatFullPassAsAnyDay?: boolean },
): boolean {
  const passOrCombo = isComboOrPassOffer(tier)
  if (activeTabId === FULL_PASS_TAB_ID) return passOrCombo
  if (passOrCombo) return Boolean(options?.treatFullPassAsAnyDay)
  return resolveTicketDateMeta(tier).dateId === activeTabId
}

/** Tickets of the selected jornada, plus unbound SKUs that are not combos. */
export function ticketVisibleOnCheckoutDay(
  tier: TicketSelectorTier,
  dateId: string | null | undefined,
): boolean {
  if (!dateId) return !isComboOrPassOffer(tier)
  if (ticketMatchesTab(tier, dateId)) return true
  if (isComboOrPassOffer(tier)) return false
  return resolveTicketDateMeta(tier).dateId == null
}

export function listCheckoutDayTabs(
  scheduleDays: ScheduleDay[] = [],
  tiers: TicketSelectorTier[] = [],
): TicketDayGroup[] {
  const dayTickets = tiers.filter((tier) => isDaySpecificTicket(tier))
  if (scheduleDays.length > 0) {
    return scheduleDays
      .map((day) => ({
        dateId: day.id,
        dateLabel: day.title?.trim() || formatEventDay(day.start_time),
        tickets: dayTickets.filter(
          (tier) => resolveTicketDateMeta(tier).dateId === day.id,
        ),
      }))
      .filter((group) => group.tickets.length > 0)
  }
  return groupTicketsByDate(dayTickets, scheduleDays).ticketsByDate
}

export function isSamePriceAnyDay(
  tiers: TicketSelectorTier[],
  scheduleDays: ScheduleDay[] = [],
) {
  if (scheduleDays.length < 2) return false
  const priced = tiers.filter((tier) => Number.isFinite(tier.price))
  if (priced.length === 0) return false
  const daySpecific = priced.filter(
    (tier) => !resolveTicketDateMeta(tier).isFullPass,
  )
  if (daySpecific.length === 0) return true
  const prices = new Set(daySpecific.map((tier) => tier.price))
  return prices.size <= 1
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
