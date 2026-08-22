import {
  isPassOrComboTicket,
  type DayCoverageTicket,
} from "@/lib/inventory/day-ticket-coverage"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { normalizeDayId } from "@/lib/event-schedule"

export type TicketMatrixDay = {
  id: string
  title?: string | null
  startTime?: string | null
}

export type TicketMatrixCell = {
  index: number | null
  enabled: boolean
  price: number | null
  capacity: number | null
}

export type TicketMatrixRow = {
  name: string
  nameKey: string
  cells: Record<string, TicketMatrixCell>
}

export type TicketMatrixLike = DayCoverageTicket & {
  price?: number | null
  capacity?: number | null
}

export type DayPriceVariation =
  | { kind: "amount"; value: number }
  | { kind: "percent"; value: number }

export function matrixTicketNameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLocaleLowerCase("es")
}

export function isMatrixRowTicket(ticket: DayCoverageTicket): boolean {
  if (isPassOrComboTicket(ticket)) return false
  if (
    ticket.layoutType === "numbered_seat" ||
    ticket.layoutType === "table_combo"
  ) {
    return false
  }
  const type = inferInventoryTierType({
    tierType: ticket.tierType,
    layoutType: ticket.layoutType,
    category: ticket.category,
    bundleItems: ticket.bundleItems,
  })
  return type === "general" && Boolean(normalizeDayId(ticket.dayId))
}

export function isMatrixPassTicket(ticket: DayCoverageTicket): boolean {
  return isPassOrComboTicket(ticket)
}

export function buildTicketPriceMatrix(
  tickets: readonly TicketMatrixLike[],
  days: readonly TicketMatrixDay[],
): TicketMatrixRow[] {
  const rows = new Map<string, TicketMatrixRow>()
  tickets.forEach((ticket, index) => {
    if (!isMatrixRowTicket(ticket)) return
    const dayId = normalizeDayId(ticket.dayId)
    if (!dayId) return
    const name = ticket.name?.trim() || "General"
    const nameKey = matrixTicketNameKey(name)
    const current = rows.get(nameKey) ?? {
      name,
      nameKey,
      cells: Object.fromEntries(
        days.map((day) => [
          day.id,
          { index: null, enabled: false, price: null, capacity: null },
        ]),
      ),
    }
    if (!rows.has(nameKey)) rows.set(nameKey, current)
    current.cells[dayId] = {
      index,
      enabled: (ticket.visibility ?? "public") !== "private",
      price: Number.isFinite(Number(ticket.price)) ? Number(ticket.price) : null,
      capacity: Number.isFinite(Number(ticket.capacity))
        ? Math.floor(Number(ticket.capacity))
        : null,
    }
  })
  return [...rows.values()]
}

export function nextMatrixTypeName(
  tickets: readonly DayCoverageTicket[],
  base = "General",
): string {
  const used = new Set(
    tickets
      .filter(isMatrixRowTicket)
      .map((ticket) => matrixTicketNameKey(ticket.name)),
  )
  if (!used.has(matrixTicketNameKey(base))) return base
  let n = 2
  while (used.has(matrixTicketNameKey(`${base} ${n}`))) n += 1
  return `${base} ${n}`
}

export function nextMatrixPassName(
  tickets: readonly DayCoverageTicket[],
  base: string,
): string {
  const used = new Set(
    tickets
      .filter(isMatrixPassTicket)
      .map((ticket) => matrixTicketNameKey(ticket.name)),
  )
  if (!used.has(matrixTicketNameKey(base))) return base
  let n = 2
  while (used.has(matrixTicketNameKey(`${base} ${n}`))) n += 1
  return `${base} ${n}`
}

export function copyTicketMatrixDay<T extends TicketMatrixLike>(
  tickets: T[],
  days: readonly TicketMatrixDay[],
  sourceDayId: string,
  clone: (source: T, targetDayId: string) => T,
): T[] {
  const source = sourceDayId.trim()
  if (!source) return tickets
  const rows = buildTicketPriceMatrix(tickets, days)
  const next = [...tickets]

  for (const row of rows) {
    const sourceCell = row.cells[source]
    if (sourceCell?.index == null) continue
    const template = next[sourceCell.index]
    if (!template) continue
    for (const day of days) {
      if (day.id === source) continue
      const cell = row.cells[day.id]
      if (cell?.index != null) {
        const current = next[cell.index]
        if (!current) continue
        next[cell.index] = {
          ...current,
          price: template.price,
          capacity: template.capacity,
          visibility: sourceCell.enabled ? "public" : "private",
        }
        continue
      }
      next.push({
        ...clone(template, day.id),
        visibility: sourceCell.enabled ? "public" : "private",
      })
    }
  }

  return next
}

export function applyTicketMatrixDayVariation<T extends TicketMatrixLike>(
  tickets: T[],
  dayId: string,
  variation: DayPriceVariation,
): T[] {
  const target = dayId.trim()
  if (!target) return tickets
  return tickets.map((ticket) => {
    if (!isMatrixRowTicket(ticket)) return ticket
    if (normalizeDayId(ticket.dayId) !== target) return ticket
    if ((ticket.visibility ?? "public") === "private") return ticket
    const price = Number(ticket.price)
    if (!Number.isFinite(price)) return ticket
    const raw =
      variation.kind === "amount"
        ? price + variation.value
        : price * (1 + variation.value / 100)
    return {
      ...ticket,
      price: Math.max(0, Math.round(raw * 100) / 100),
    }
  })
}
