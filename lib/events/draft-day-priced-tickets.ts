import { isMapDraftTicket } from "@/lib/events/draft-seating-map-v2"
import { draftScheduleDayChipLabel } from "@/lib/events/draft-schedule-slots-v2"
import type { TicketCommerceType } from "@/lib/events/ticket-commerce-type"
import {
  createDraftLineItem,
  draftNumberValue,
  parseEventDraftV2,
  type EventDraftV2,
  type EventDraftV2LineItem,
  type EventDraftV2ScheduleDay,
} from "@/lib/validations/event-draft-v2"

export type DraftDayPriceStock = {
  dayId: string
  label: string
  price: number
  stock: number
  ticketId?: string
}

function liveScheduleDays(days: EventDraftV2ScheduleDay[]) {
  return days.filter((day) => Boolean(day.id?.trim()))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function boundDayIds(
  ticket: Pick<EventDraftV2LineItem, "validDayIds">,
) {
  return (ticket.validDayIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

function singleBoundDayId(
  ticket: Pick<EventDraftV2LineItem, "validDayIds"> & { slotId?: string },
): string {
  const bound = boundDayIds(ticket)
  if (bound.length === 1) return bound[0]!
  if (bound.length === 0) return ticket.slotId?.trim() ?? ""
  return ""
}

export function draftTicketNameWithoutDay(
  name: string,
  days: EventDraftV2ScheduleDay[],
): string {
  let next = name.trim()
  for (const [index, day] of days.entries()) {
    const label = draftScheduleDayChipLabel(day, index)
    if (!label) continue
    next = next.replace(
      new RegExp(`\\s*[·\\-–—]?\\s*${escapeRegExp(label)}\\s*$`, "i"),
      "",
    )
  }
  return next.trim() || name.trim()
}

export function ticketSharesDayPricingFamily(
  left: Pick<EventDraftV2LineItem, "name">,
  right: Pick<EventDraftV2LineItem, "name">,
  days: EventDraftV2ScheduleDay[],
): boolean {
  const a = draftTicketNameWithoutDay(left.name, days).toLowerCase()
  const b = draftTicketNameWithoutDay(right.name, days).toLowerCase()
  return Boolean(a) && a === b
}

export function dayPricedTicketName(
  name: string,
  day: EventDraftV2ScheduleDay,
  index: number,
  days: EventDraftV2ScheduleDay[],
): string {
  const base = draftTicketNameWithoutDay(name, days)
  const label = draftScheduleDayChipLabel(day, index)
  if (!base) return label
  if (new RegExp(`${escapeRegExp(label)}$`, "i").test(base)) return base
  return `${base} ${label}`
}

function findExistingDayTicketIndex(
  tickets: EventDraftV2LineItem[],
  sourceIndex: number,
  dayId: string,
  days: EventDraftV2ScheduleDay[],
  source: EventDraftV2LineItem,
): number {
  const candidates = tickets.flatMap((ticket, index) => {
    if (index === sourceIndex || isMapDraftTicket(ticket)) return []
    const bound = boundDayIds(ticket)
    const day = bound.length === 1 ? bound[0] : ticket.slotId?.trim() ?? ""
    if (day !== dayId) return []
    return [{ ticket, index }]
  })
  const family = candidates.filter(({ ticket }) =>
    ticketSharesDayPricingFamily(source, ticket, days),
  )
  if (family.length === 1) return family[0]!.index
  if (candidates.length === 1) return candidates[0]!.index
  return -1
}

export function draftLineItemSellableStock(
  ticket: Pick<EventDraftV2LineItem, "stock" | "dayRates">,
): number {
  const rates = ticket.dayRates ?? []
  if (rates.length > 0) {
    return rates.reduce((sum, rate) => sum + draftNumberValue(rate.stock), 0)
  }
  return draftNumberValue(ticket.stock)
}

export function ensureDraftDayRates(
  ticket: EventDraftV2LineItem,
  days: EventDraftV2ScheduleDay[],
): EventDraftV2LineItem {
  const liveDays = liveScheduleDays(days)
  if (liveDays.length < 2 || isMapDraftTicket(ticket)) {
    return { ...ticket, dayRates: ticket.dayRates ?? [] }
  }
  const previous = new Map(
    (ticket.dayRates ?? [])
      .filter((rate) => rate.dayId.trim())
      .map((rate) => [rate.dayId.trim(), rate]),
  )
  const dayRates = liveDays.map((day) => {
    const dayId = day.id.trim()
    const prev = previous.get(dayId)
    return {
      dayId,
      price: draftNumberValue(prev?.price ?? ticket.price),
      stock: draftNumberValue(prev?.stock ?? ticket.stock),
      ticketId: prev?.ticketId?.trim() ?? "",
    }
  })
  return {
    ...ticket,
    dayRates,
    price: draftNumberValue(dayRates[0]?.price ?? ticket.price),
    stock: draftLineItemSellableStock({ ...ticket, dayRates }),
  }
}

export function sameDraftDayRateIds(
  left: EventDraftV2LineItem["dayRates"] | undefined,
  right: EventDraftV2LineItem["dayRates"] | undefined,
): boolean {
  const a = (left ?? []).map((rate) => rate.dayId.trim()).filter(Boolean)
  const b = (right ?? []).map((rate) => rate.dayId.trim()).filter(Boolean)
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function draftDayPriceStockRows(
  ticket: EventDraftV2LineItem,
  tickets: EventDraftV2LineItem[],
  sourceIndex: number,
  days: EventDraftV2ScheduleDay[],
): DraftDayPriceStock[] {
  return liveScheduleDays(days).map((day, index) => {
    const dayId = day.id.trim()
    const stored = (ticket.dayRates ?? []).find((item) => item.dayId === dayId)
    const existingIndex = findExistingDayTicketIndex(
      tickets,
      sourceIndex,
      dayId,
      days,
      ticket,
    )
    const existing = existingIndex >= 0 ? tickets[existingIndex] : undefined
    return {
      dayId,
      label: draftScheduleDayChipLabel(day, index),
      price: draftNumberValue(stored?.price ?? existing?.price ?? ticket.price),
      stock: draftNumberValue(stored?.stock ?? existing?.stock ?? ticket.stock),
      ticketId: stored?.ticketId?.trim() || existing?.id || "",
    }
  })
}

export function applyDraftDayPriceStock(
  tickets: EventDraftV2LineItem[],
  sourceIndex: number,
  days: EventDraftV2ScheduleDay[],
  rates: DraftDayPriceStock[],
): EventDraftV2LineItem[] {
  const source = tickets[sourceIndex]
  if (!source || isMapDraftTicket(source)) return tickets
  const liveDays = liveScheduleDays(days)
  if (liveDays.length < 2) return tickets

  const next = [...tickets]
  const created: EventDraftV2LineItem[] = []
  let reusedSource = false

  for (const [index, day] of liveDays.entries()) {
    const dayId = day.id.trim()
    const rate = rates.find((item) => item.dayId === dayId)
    const price = rate?.price ?? draftNumberValue(source.price)
    const stock = rate?.stock ?? draftNumberValue(source.stock)
    const existingIndex = findExistingDayTicketIndex(
      next,
      sourceIndex,
      dayId,
      days,
      source,
    )
    if (existingIndex >= 0) {
      const current = next[existingIndex]!
      next[existingIndex] = {
        ...current,
        price,
        stock,
        slotId: dayId,
        validDayIds: [dayId],
        dayRates: [],
      }
      continue
    }
    const persistId =
      rate?.ticketId?.trim() ||
      (reusedSource ? crypto.randomUUID() : source.id)
    const patch: EventDraftV2LineItem = {
      ...(reusedSource ? source : next[sourceIndex]!),
      id: persistId,
      name: dayPricedTicketName(source.name, day, index, days),
      price,
      stock,
      slotId: dayId,
      validDayIds: [dayId],
      dayRates: [],
    }
    if (!reusedSource) {
      next[sourceIndex] = patch
      reusedSource = true
      continue
    }
    created.push(patch)
  }

  if (created.length === 0) return next
  next.splice(sourceIndex + 1, 0, ...created)
  return next
}

export function expandDayPricedTicketsForPersist(
  tickets: EventDraftV2LineItem[],
  days: EventDraftV2ScheduleDay[],
): EventDraftV2LineItem[] {
  const liveDays = liveScheduleDays(days)
  if (liveDays.length < 2) {
    return tickets.map((ticket) => ({ ...ticket, dayRates: [] }))
  }

  const consumed = new Set<number>()
  const next: EventDraftV2LineItem[] = []

  for (const [index, ticket] of tickets.entries()) {
    if (consumed.has(index)) continue
    if (
      isMapDraftTicket(ticket) ||
      !generalTicketNeedsDayPricing(ticket, liveDays.length)
    ) {
      next.push({ ...ticket, dayRates: [] })
      continue
    }

    const rows = draftDayPriceStockRows(ticket, tickets, index, days)
    for (const [dayIndex, day] of liveDays.entries()) {
      const dayId = day.id.trim()
      const rate = rows.find((item) => item.dayId === dayId)
      const existingIndex = findExistingDayTicketIndex(
        tickets,
        index,
        dayId,
        days,
        ticket,
      )
      if (existingIndex >= 0) consumed.add(existingIndex)
      const existing = existingIndex >= 0 ? tickets[existingIndex] : undefined
      const persistId =
        rate?.ticketId?.trim() ||
        existing?.id ||
        (dayIndex === 0 ? ticket.id : crypto.randomUUID())
      next.push({
        ...(existing ?? ticket),
        id: persistId,
        name: dayPricedTicketName(ticket.name, day, dayIndex, days),
        price: draftNumberValue(rate?.price ?? ticket.price),
        stock: draftNumberValue(rate?.stock ?? ticket.stock),
        slotId: dayId,
        validDayIds: [dayId],
        dayRates: [],
      })
    }
    consumed.add(index)
  }

  return next
}

export function collapseDayPricedTicketsForEditor(
  tickets: EventDraftV2LineItem[],
  days: EventDraftV2ScheduleDay[],
): EventDraftV2LineItem[] {
  const liveDays = liveScheduleDays(days)
  if (liveDays.length < 2) return tickets

  const used = new Set<number>()
  const next: EventDraftV2LineItem[] = []

  for (const [index, ticket] of tickets.entries()) {
    if (used.has(index) || isMapDraftTicket(ticket)) {
      if (!used.has(index)) next.push(ticket)
      continue
    }

    const singles = tickets.flatMap((other, otherIndex) => {
      if (used.has(otherIndex) || isMapDraftTicket(other)) return []
      if (!ticketSharesDayPricingFamily(ticket, other, days)) return []
      if (boundDayIds(other).length > 1) return []
      const dayId = singleBoundDayId(other)
      if (!dayId) return []
      return [{ other, otherIndex, dayId }]
    })

    const unique = new Map<string, (typeof singles)[number]>()
    for (const row of singles) {
      if (!unique.has(row.dayId)) unique.set(row.dayId, row)
    }

    if (unique.size < 2) {
      next.push(
        generalTicketNeedsDayPricing(ticket, liveDays.length)
          ? ensureDraftDayRates(ticket, days)
          : ticket,
      )
      continue
    }

    const members = [...unique.values()]
    for (const member of members) used.add(member.otherIndex)
    const first = members[0]!.other
    next.push(
      ensureDraftDayRates(
        {
          ...first,
          name: draftTicketNameWithoutDay(first.name, days),
          slotId: "",
          validDayIds: [],
          dayRates: members.map((member) => ({
            dayId: member.dayId,
            price: draftNumberValue(member.other.price),
            stock: draftNumberValue(member.other.stock),
            ticketId: member.other.id,
          })),
        },
        days,
      ),
    )
  }

  return next
}

export function hydrateEventDraftV2ForEditor(raw: unknown): EventDraftV2 {
  const draft = parseEventDraftV2(raw)
  return {
    ...draft,
    tickets: collapseDayPricedTicketsForEditor(draft.tickets, draft.schedule),
  }
}

export function createDraftLineItemsForScheduleDays(
  days: EventDraftV2ScheduleDay[],
  ticketType: TicketCommerceType = "standard",
): EventDraftV2LineItem[] {
  const liveDays = liveScheduleDays(days)
  const item = createDraftLineItem(ticketType)
  if (liveDays.length < 2) return [item]
  return [
    ensureDraftDayRates(
      {
        ...item,
        name: "General",
        slotId: "",
        validDayIds: [],
      },
      days,
    ),
  ]
}

/** Unbound general on a multi-day event → one visual card, one persist row per jornada. */
export function generalTicketNeedsDayPricing(
  ticket: Pick<EventDraftV2LineItem, "source" | "validDayIds" | "sectorId">,
  dayCount: number,
): boolean {
  if (dayCount < 2 || isMapDraftTicket(ticket)) return false
  return boundDayIds(ticket).length === 0
}

/** Align one ticket with the live schedule. `null` means the row can stay as-is. */
export function nextDraftTicketAfterScheduleChange(
  ticket: EventDraftV2LineItem,
  days: EventDraftV2ScheduleDay[],
): EventDraftV2LineItem | null {
  if (isMapDraftTicket(ticket)) return null
  const liveCount = liveScheduleDays(days).length
  if (!generalTicketNeedsDayPricing(ticket, liveCount)) {
    if (liveCount < 2 && (ticket.dayRates?.length ?? 0) > 0) {
      return { ...ticket, dayRates: [] }
    }
    return null
  }
  const synced = ensureDraftDayRates(ticket, days)
  if (sameDraftDayRateIds(ticket.dayRates, synced.dayRates)) return null
  return synced
}
