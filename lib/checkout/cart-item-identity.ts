import { asHoldEventDateId } from "@/lib/checkout/seat-hold-day"
import {
  CART_TICKET_LINE_PREFIX,
  cartLineQuantity,
} from "@/lib/checkout/cart-lines"
import {
  cartItemDateString,
  cartItemScheduleId,
  cartItemSeatLabel,
} from "@/lib/checkout/cart-line-stamp"

export type CartIdentityLine = {
  id: string
  ticketTierId?: string | null
  ticketTypeId?: string | null
  name: string
  quantity: number
  price: number
  seatId?: string | null
  elementId?: string | null
  sectorId?: string | null
  sectorName?: string | null
  scheduleId?: string | null
  dateId?: string | null
  dateString?: string | null
  dateLabel?: string | null
  seatLabel?: string | null
  placeLabel?: string | null
}

const LEGACY_SEP = "__"
const DAY_OR_ALL =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|all)$/i

export function cartScheduleToken(scheduleId?: string | null): string {
  return asHoldEventDateId(scheduleId) ?? (scheduleId?.trim() || "all")
}

/** `ticketId_scheduleId` — and `_unitId` when the line is a map place. */
export function cartCompositeItemId(
  ticketId: string,
  scheduleId?: string | null,
  unitId?: string | null,
): string {
  const ticket = ticketId.trim()
  const day = cartScheduleToken(scheduleId)
  const unit = unitId?.trim()
  return unit ? `${ticket}_${day}_${unit}` : `${ticket}_${day}`
}

export function parseCartCompositeItemId(id: string): {
  ticketId: string
  scheduleId: string | null
  unitId: string | null
} | null {
  const raw = id.trim()
  if (!raw) return null
  if (raw.startsWith(CART_TICKET_LINE_PREFIX)) {
    const rest = raw.slice(CART_TICKET_LINE_PREFIX.length)
    const sep = rest.indexOf(LEGACY_SEP)
    if (sep === -1) {
      return { ticketId: rest, scheduleId: null, unitId: null }
    }
    const ticketId = rest.slice(0, sep)
    const day = rest.slice(sep + LEGACY_SEP.length)
    return {
      ticketId,
      scheduleId: day === "all" ? null : day || null,
      unitId: null,
    }
  }
  const parts = raw.split("_")
  if (parts.length < 2) {
    return { ticketId: raw, scheduleId: null, unitId: null }
  }
  const ticketId = parts[0] ?? ""
  const day = parts[1] ?? ""
  if (!ticketId || !DAY_OR_ALL.test(day)) {
    return { ticketId: raw, scheduleId: null, unitId: null }
  }
  const unit = parts.slice(2).join("_")
  return {
    ticketId,
    scheduleId: day === "all" ? null : day,
    unitId: unit || null,
  }
}

export function isMapCartLine(line: {
  seatId?: string | null
  elementId?: string | null
}): boolean {
  return Boolean(line.seatId?.trim() || line.elementId?.trim())
}

export function generalLineTierId(line: {
  id: string
  ticketTierId?: string | null
}): string {
  return (
    line.ticketTierId?.trim() ||
    parseCartCompositeItemId(line.id)?.ticketId ||
    ""
  )
}

export type CartLineSnapshot = {
  scheduleId: string | null
  dateString: string | null
  sectorName: string | null
  seatLabel: string | null
}

export function cartLineSnapshot(input: {
  scheduleId?: string | null
  dateId?: string | null
  eventDateId?: string | null
  dateString?: string | null
  dateLabel?: string | null
  sectorName?: string | null
  seatLabel?: string | null
  placeLabel?: string | null
}): CartLineSnapshot {
  return {
    scheduleId: cartItemScheduleId(input),
    dateString: cartItemDateString(input),
    sectorName: input.sectorName?.trim() || null,
    seatLabel: cartItemSeatLabel(input),
  }
}

/** `preferred` is the already-frozen stamp. Empty fields fall back to the line. */
export function freezeCartLineSnapshot<T extends CartIdentityLine>(
  line: T,
  preferred?: Partial<CartLineSnapshot> | null,
): T {
  const fallback = cartLineSnapshot(line)
  const next = {
    scheduleId: preferred?.scheduleId ?? fallback.scheduleId,
    dateString: preferred?.dateString ?? fallback.dateString,
    sectorName: preferred?.sectorName ?? fallback.sectorName,
    seatLabel: preferred?.seatLabel ?? fallback.seatLabel,
  }
  return {
    ...line,
    ...(next.scheduleId
      ? { scheduleId: next.scheduleId, dateId: next.scheduleId }
      : {}),
    ...(next.dateString
      ? { dateString: next.dateString, dateLabel: next.dateString }
      : {}),
    ...(next.sectorName ? { sectorName: next.sectorName } : {}),
    ...(next.seatLabel
      ? {
          seatLabel: next.seatLabel,
          placeLabel: line.placeLabel?.trim() || next.seatLabel,
        }
      : {}),
  }
}

export function upsertGeneralCartLine<T extends CartIdentityLine>(
  lines: T[],
  input: {
    ticketTierId: string
    name: string
    price: number
    quantity: number
    scheduleId?: string | null
    dateString?: string | null
    sectorName?: string | null
    seatLabel?: string | null
  },
): T[] {
  const snapshot = cartLineSnapshot(input)
  const id = cartCompositeItemId(input.ticketTierId, snapshot.scheduleId)
  const existing = lines.find(
    (line) => !isMapCartLine(line) && line.id === id,
  )
  const others = lines.filter((line) => line.id !== id)
  if (input.quantity <= 0) return others
  const stamped = freezeCartLineSnapshot(
    {
      ...(existing ?? {}),
      id,
      ticketTierId: input.ticketTierId,
      ticketTypeId: input.ticketTierId,
      name: input.name,
      quantity: input.quantity,
      price: input.price,
    } as T,
    existing ? cartLineSnapshot(existing) : snapshot,
  )
  return [...others, stamped]
}

function cartLineUnitId(line: CartIdentityLine): string {
  return line.seatId?.trim() || line.elementId?.trim() || ""
}

/** Same place/ticket slot, used to drop a legacy id when the incoming line changed format. */
export function sameCartPlace(
  left: CartIdentityLine,
  right: CartIdentityLine,
): boolean {
  const leftUnit = cartLineUnitId(left)
  const rightUnit = cartLineUnitId(right)
  const leftDay = cartItemScheduleId(left)
  const rightDay = cartItemScheduleId(right)
  const sameDay = !leftDay || !rightDay || leftDay === rightDay
  if (leftUnit && leftUnit === rightUnit) return sameDay
  if (
    !isMapCartLine(left) &&
    !isMapCartLine(right) &&
    generalLineTierId(left) &&
    generalLineTierId(left) === generalLineTierId(right)
  ) {
    return sameDay
  }
  return false
}

export function mergeImmutableCartLines<T extends CartIdentityLine>(
  current: T[],
  incoming: T[],
): T[] {
  const incomingDays = new Set(
    incoming
      .map((line) => cartItemScheduleId(line))
      .filter((id): id is string => Boolean(id)),
  )
  const kept = current.filter((line) => {
    if (incoming.some((item) => item.id === line.id || sameCartPlace(line, item))) {
      return false
    }
    const day = cartItemScheduleId(line)
    if (day && incomingDays.has(day)) return false
    return true
  })
  const nextIncoming = incoming.map((line) => {
    const prev = current.find(
      (item) => item.id === line.id || sameCartPlace(item, line),
    )
    return freezeCartLineSnapshot(line, prev ? cartLineSnapshot(prev) : null)
  })
  return [...kept, ...nextIncoming]
}

export function cartQuantityKey(
  ticketId: string,
  scheduleId?: string | null,
): string {
  return cartCompositeItemId(ticketId, scheduleId)
}

/** Exact composite key for this ticket + jornada. No match → 0. */
export function cartQuantityOnSchedule(
  quantities: Record<string, number> | null | undefined,
  ticketId: string,
  scheduleId?: string | null,
): number {
  const ticket = ticketId.trim()
  if (!ticket) return 0
  const exact = cartQuantityKey(ticket, scheduleId)
  if (quantities && Object.prototype.hasOwnProperty.call(quantities, exact)) {
    return cartLineQuantity(quantities[exact])
  }
  if (asHoldEventDateId(scheduleId)) return 0
  return cartLineQuantity(quantities?.[ticket])
}

export function projectQuantitiesForSchedule(
  quantities: Record<string, number>,
  lines: readonly CartIdentityLine[],
  scheduleId?: string | null,
): Record<string, number> {
  const active = asHoldEventDateId(scheduleId)
  const projected: Record<string, number> = {}
  for (const line of lines) {
    if (isMapCartLine(line)) continue
    const day = cartItemScheduleId(line)
    if (active && day !== active) continue
    const tierId = generalLineTierId(line)
    if (!tierId) continue
    projected[tierId] = cartLineQuantity(line.quantity)
  }
  for (const [key, qty] of Object.entries(quantities)) {
    const amount = cartLineQuantity(qty)
    const parsed = parseCartCompositeItemId(key)
    if (parsed?.unitId) continue
    const ticketId = parsed?.ticketId || key
    if (active) {
      if (parsed?.scheduleId === active) {
        projected[ticketId] = amount
      }
      continue
    }
    projected[ticketId] = amount
  }
  if (active) {
    for (const [key, qty] of Object.entries(quantities)) {
      const parsed = parseCartCompositeItemId(key)
      if (parsed?.unitId || parsed?.scheduleId) continue
      const ticketId = parsed?.ticketId || key
      if (projected[ticketId] != null) continue
      if (key === cartQuantityKey(ticketId, null)) {
        projected[ticketId] = cartLineQuantity(qty)
      }
    }
  }
  return projected
}

export function cartMapUnitIdsForSchedule(
  lines: readonly CartIdentityLine[],
  scheduleId?: string | null,
): string[] {
  const active = asHoldEventDateId(scheduleId)
  const ids: string[] = []
  for (const line of lines) {
    if (!isMapCartLine(line)) continue
    const day = cartItemScheduleId(line)
    if (active && day !== active) continue
    const unit = line.seatId?.trim() || line.elementId?.trim()
    if (unit) ids.push(unit)
  }
  return ids
}
