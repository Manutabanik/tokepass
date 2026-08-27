import { isMapDraftTicket } from "@/lib/events/draft-seating-map-v2"
import { draftScheduleDayChipLabel } from "@/lib/events/draft-schedule-slots-v2"
import {
  createDraftLineItem,
  draftNumberValue,
  type EventDraftV2LineItem,
  type EventDraftV2ScheduleDay,
} from "@/lib/validations/event-draft-v2"
import type { TicketCommerceType } from "@/lib/events/ticket-commerce-type"

export type DraftDayPriceStock = {
  dayId: string
  label: string
  price: number
  stock: number
}

function liveScheduleDays(days: EventDraftV2ScheduleDay[]) {
  return days.filter((day) => Boolean(day.id?.trim()))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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
    const bound = (ticket.validDayIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
    if (bound.length !== 1 || bound[0] !== dayId) return []
    return [{ ticket, index }]
  })
  const family = candidates.filter(({ ticket }) =>
    ticketSharesDayPricingFamily(source, ticket, days),
  )
  if (family.length === 1) return family[0]!.index
  if (candidates.length === 1) return candidates[0]!.index
  return -1
}

export function draftDayPriceStockRows(
  ticket: EventDraftV2LineItem,
  tickets: EventDraftV2LineItem[],
  sourceIndex: number,
  days: EventDraftV2ScheduleDay[],
): DraftDayPriceStock[] {
  return liveScheduleDays(days).map((day, index) => {
    const dayId = day.id.trim()
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
      price: draftNumberValue(existing?.price ?? ticket.price),
      stock: draftNumberValue(existing?.stock ?? ticket.stock),
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
      }
      continue
    }
    const patch: EventDraftV2LineItem = {
      ...(reusedSource ? source : next[sourceIndex]!),
      name: dayPricedTicketName(source.name, day, index, days),
      price,
      stock,
      slotId: dayId,
      validDayIds: [dayId],
    }
    if (!reusedSource) {
      next[sourceIndex] = { ...patch, id: source.id }
      reusedSource = true
      continue
    }
    created.push({ ...patch, id: crypto.randomUUID() })
  }

  if (created.length === 0) return next
  next.splice(sourceIndex + 1, 0, ...created)
  return next
}

export function createDraftLineItemsForScheduleDays(
  days: EventDraftV2ScheduleDay[],
  ticketType: TicketCommerceType = "standard",
): EventDraftV2LineItem[] {
  const liveDays = liveScheduleDays(days)
  if (liveDays.length < 2) return [createDraftLineItem(ticketType)]
  return liveDays.map((day, index) => {
    const dayId = day.id.trim()
    const label = draftScheduleDayChipLabel(day, index)
    return {
      ...createDraftLineItem(ticketType),
      name: `General ${label}`,
      slotId: dayId,
      validDayIds: [dayId],
    }
  })
}

export function generalTicketNeedsDayPricing(
  ticket: Pick<EventDraftV2LineItem, "source" | "validDayIds" | "sectorId">,
  dayCount: number,
): boolean {
  if (dayCount < 2 || isMapDraftTicket(ticket)) return false
  return (ticket.validDayIds ?? []).filter((id) => id.trim()).length !== 1
}
