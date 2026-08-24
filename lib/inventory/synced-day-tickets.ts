import { createInventoryTicket } from "@/lib/inventory/create-inventory-ticket"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { normalizeDayId } from "@/lib/event-schedule"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"

export type InventoryTicket = EventFormValues["tickets"][number]

export type InventoryFamilyKind = "general" | "map"

export type InventoryFamily = {
  key: string
  name: string
  kind: InventoryFamilyKind
  indexes: number[]
  stock: number
  sold: number
  price: number
  priceMixed: boolean
  seatingSectorId: string | null
}

function asMoney(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function asStock(value: unknown): number {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function ticketSoldCount(ticket: Pick<InventoryTicket, "sold"> | null | undefined) {
  const parsed = Math.floor(Number(ticket?.sold))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export const TIER_HAS_SALES_LOCK_HINT =
  "No se puede eliminar porque ya tiene ventas registradas."

export function ticketFamilyNameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLocaleLowerCase("es")
}

export function isBlankInventoryTicket(ticket: InventoryTicket): boolean {
  if (isMapBackedTicket(ticket)) return false
  const type = inferInventoryTierType({
    tierType: ticket.tierType,
    layoutType: ticket.layoutType,
    bundleItems: ticket.bundleItems,
  })
  if (type !== "general") return false
  const unnamed = !(ticket.name ?? "").trim()
  const noStock = asStock(ticket.capacity) <= 0
  const noPaidPrice = !(Number(ticket.price) > 0)
  return unnamed && noStock && noPaidPrice && !ticket.seatingSectorId
}

export function isGeneralAdmissionTicket(ticket: InventoryTicket): boolean {
  if (isMapBackedTicket(ticket)) return false
  return (
    inferInventoryTierType({
      tierType: ticket.tierType,
      layoutType: ticket.layoutType,
      bundleItems: ticket.bundleItems,
    }) === "general"
  )
}

export function pricesAreDifferentiated(
  prices: readonly number[],
): boolean {
  if (prices.length <= 1) return false
  const first = prices[0] ?? 0
  return prices.some((price) => price !== first)
}

function familyFromIndexes(
  tickets: readonly InventoryTicket[],
  indexes: number[],
  kind: InventoryFamilyKind,
  key: string,
  seatingSectorId: string | null,
): InventoryFamily | null {
  if (indexes.length === 0) return null
  const rows = indexes
    .map((index) => tickets[index])
    .filter((row): row is InventoryTicket => Boolean(row))
  if (rows.length === 0) return null
  const prices = rows.map((row) => asMoney(row.price))
  return {
    key,
    name: rows[0]?.name?.trim() || (kind === "map" ? "Sector" : "Entrada"),
    kind,
    indexes,
    stock: asStock(rows[0]?.capacity),
    sold: rows.reduce((sum, row) => sum + ticketSoldCount(row), 0),
    price: Math.min(...prices),
    priceMixed: pricesAreDifferentiated(prices),
    seatingSectorId,
  }
}

export function listInventoryFamilies(
  tickets: readonly InventoryTicket[] | null | undefined,
): InventoryFamily[] {
  const rows = tickets ?? []
  const families: InventoryFamily[] = []
  const generalBuckets = new Map<string, number[]>()
  const mapBuckets = new Map<string, number[]>()

  rows.forEach((ticket, index) => {
    if (isMapBackedTicket(ticket)) {
      const sectorId = ticket.seatingSectorId?.trim() || `map-${index}`
      const bucket = mapBuckets.get(sectorId) ?? []
      bucket.push(index)
      mapBuckets.set(sectorId, bucket)
      return
    }
    if (!isGeneralAdmissionTicket(ticket) || isBlankInventoryTicket(ticket)) {
      return
    }
    const nameKey = ticketFamilyNameKey(ticket.name) || `ga-${index}`
    const bucket = generalBuckets.get(nameKey) ?? []
    bucket.push(index)
    generalBuckets.set(nameKey, bucket)
  })

  for (const [nameKey, indexes] of generalBuckets) {
    const family = familyFromIndexes(rows, indexes, "general", nameKey, null)
    if (family) families.push(family)
  }
  for (const [sectorId, indexes] of mapBuckets) {
    const family = familyFromIndexes(rows, indexes, "map", sectorId, sectorId)
    if (family) families.push(family)
  }
  return families
}

export function familyHasDifferentiatedPrices(
  tickets: readonly InventoryTicket[],
  indexes: readonly number[],
): boolean {
  return pricesAreDifferentiated(
    indexes.map((index) => asMoney(tickets[index]?.price)),
  )
}

export function removeTicketFamily(
  tickets: readonly InventoryTicket[],
  indexes: readonly number[],
): InventoryTicket[] {
  const drop = new Set(indexes)
  return tickets.filter((_, index) => !drop.has(index))
}

export function cloneTicketForDay(
  source: InventoryTicket,
  dayId: string | null,
  keepIdentity: boolean,
): InventoryTicket {
  return {
    ...source,
    id: keepIdentity ? source.id : undefined,
    isNew: keepIdentity ? source.isNew : true,
    sold: keepIdentity ? source.sold : 0,
    dayId,
    phases: keepIdentity
      ? source.phases
      : (source.phases ?? []).map((phase) => ({
          ...phase,
          id: undefined,
          sold: 0,
        })),
  }
}

/** Completa días faltantes de una familia sin reordenar el array entero. */
export function planMissingFamilyDayTickets(input: {
  tickets: readonly InventoryTicket[]
  indexes: readonly number[]
  dayIds: readonly string[]
  isMultiDay: boolean
}): { keepIndexes: number[]; append: InventoryTicket[] } {
  const existing = input.indexes
    .map((index) => ({ index, ticket: input.tickets[index] }))
    .filter(
      (row): row is { index: number; ticket: InventoryTicket } =>
        Boolean(row.ticket),
    )
  if (!input.isMultiDay || input.dayIds.length < 2) {
    return { keepIndexes: existing.map((row) => row.index), append: [] }
  }
  const claimed = new Set<number>()
  const keepIndexes: number[] = []
  const append: InventoryTicket[] = []
  const template =
    existing[0]?.ticket ?? createInventoryTicket("general")
  for (const dayId of input.dayIds) {
    const match = existing.find((row) => {
      if (claimed.has(row.index)) return false
      return normalizeDayId(row.ticket.dayId) === dayId
    })
    if (match) {
      claimed.add(match.index)
      keepIndexes.push(match.index)
      continue
    }
    append.push(cloneTicketForDay(template, dayId, false))
  }
  return { keepIndexes, append }
}

export function upsertSyncedDayTickets(input: {
  tickets: readonly InventoryTicket[]
  dayIds: readonly string[]
  isMultiDay: boolean
  indexes: readonly number[]
  name: string
  capacity: number | undefined
  basePrice: number
  differentiate: boolean
  dayPrices?: Record<string, number>
  kind: InventoryFamilyKind
  seatingSectorId?: string | null
}): { tickets: InventoryTicket[]; indexes: number[] } {
  const current = [...input.tickets]
  const existing = input.indexes
    .map((index) => current[index])
    .filter((row): row is InventoryTicket => Boolean(row))
  const template =
    existing[0] ??
    createInventoryTicket(input.kind === "map" ? "seated" : "general")
  const slots =
    input.isMultiDay && input.dayIds.length >= 2
      ? input.dayIds
      : [input.dayIds[0] ?? null]
  const claimed = new Set<number>()

  function takeSource(dayId: string | null, slotIndex: number): {
    source: InventoryTicket
    keepIdentity: boolean
  } {
    const exact = existing.findIndex((row, index) => {
      if (claimed.has(index)) return false
      if (!dayId) return true
      return normalizeDayId(row.dayId) === dayId
    })
    if (exact >= 0) {
      claimed.add(exact)
      return { source: existing[exact]!, keepIdentity: true }
    }
    if (slotIndex === 0 && existing[0]) {
      claimed.add(0)
      return { source: existing[0], keepIdentity: true }
    }
    return { source: template, keepIdentity: false }
  }

  const nextFamily = slots.map((dayId, slotIndex) => {
    const { source, keepIdentity } = takeSource(dayId, slotIndex)
    const price =
      input.differentiate && dayId
        ? (input.dayPrices?.[dayId] ?? input.basePrice)
        : input.basePrice
    const next = cloneTicketForDay(source, dayId, keepIdentity)
    next.name = input.name.trim() || next.name
    next.price = price
    next.basePrice = input.basePrice
    if (input.kind === "general") {
      if (input.capacity != null) next.capacity = input.capacity
      next.tierType = "general"
      next.layoutType = "general"
      next.seatingSectorId = null
    } else {
      next.seatingSectorId =
        input.seatingSectorId ?? source.seatingSectorId ?? null
    }
    return next
  })

  const others = current.filter((_, index) => !input.indexes.includes(index))
  const blanks = others
    .map((ticket, index) => ({ ticket, index }))
    .filter(({ ticket }) => isBlankInventoryTicket(ticket))
  if (input.indexes.length === 0 && blanks.length > 0) {
    const reusable = blanks.slice(0, nextFamily.length)
    const replaceAt = new Set(reusable.map((item) => item.index))
    let cursor = 0
    const landed: number[] = []
    const merged = others.map((ticket, index) => {
      if (!replaceAt.has(index)) return ticket
      const next = nextFamily[cursor]
      landed.push(index)
      cursor += 1
      return next ?? ticket
    })
    const appended = nextFamily.slice(cursor)
    const start = merged.length
    appended.forEach((_, offset) => landed.push(start + offset))
    return { tickets: [...merged, ...appended], indexes: landed }
  }
  const start = others.length
  return {
    tickets: [...others, ...nextFamily],
    indexes: nextFamily.map((_, offset) => start + offset),
  }
}

export function applyFamilyBasePrice(
  tickets: readonly InventoryTicket[],
  indexes: readonly number[],
  basePrice: number,
): InventoryTicket[] {
  return tickets.map((ticket, index) =>
    indexes.includes(index) ? { ...ticket, price: basePrice, basePrice } : ticket,
  )
}

export function findFamilyByIndexes(
  tickets: readonly InventoryTicket[],
  indexes: readonly number[],
): InventoryFamily | null {
  const families = listInventoryFamilies(tickets)
  const wanted = [...indexes].sort((left, right) => left - right).join(",")
  return (
    families.find(
      (family) =>
        [...family.indexes].sort((left, right) => left - right).join(",") ===
        wanted,
    ) ??
    familyFromIndexes(
      tickets,
      [...indexes],
      tickets[indexes[0] ?? -1] &&
        isMapBackedTicket(tickets[indexes[0]!]!)
        ? "map"
        : "general",
      "open",
      tickets[indexes[0] ?? -1]?.seatingSectorId ?? null,
    )
  )
}
