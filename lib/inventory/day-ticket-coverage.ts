import {
  isFullPassDayId,
  normalizeDayId,
  remapBoundDayId,
} from "@/lib/event-schedule"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"

export type DayCoverageTicket = {
  id?: string
  isNew?: boolean
  name?: string | null
  dayId?: string | null
  visibility?: string | null
  capacity?: number | null
  sold?: number | null
  isFullPass?: boolean
  tierType?: string | null
  layoutType?: string | null
  category?: string | null
  bundleType?: string | null
  bundleItems?: Array<{ tierId: string; quantity: number }> | null
  comboItems?: Array<unknown> | null
  phases?: Array<{ id?: string; sold?: number | null }>
}

export function isActiveInventoryTicket(
  ticket: Pick<DayCoverageTicket, "visibility">,
): boolean {
  return (ticket.visibility ?? "public") !== "private"
}

export function isPassOrComboTicket(ticket: DayCoverageTicket): boolean {
  const type = inferInventoryTierType({
    tierType: ticket.tierType,
    layoutType: ticket.layoutType,
    category: ticket.category,
    bundleItems:
      ticket.bundleItems ??
      (ticket.comboItems && ticket.comboItems.length > 0
        ? [{ tierId: "combo", quantity: 1 }]
        : null),
  })
  if (type === "bundle") return true
  if (String(ticket.bundleType ?? "").trim() === "multi_day_pass") return true
  if (ticket.isFullPass) return true
  return isFullPassDayId(ticket.dayId)
}

export function isDaySpecificTicket(ticket: DayCoverageTicket): boolean {
  return !isPassOrComboTicket(ticket) && Boolean(normalizeDayId(ticket.dayId))
}

export function ticketCoversScheduleDay(
  ticket: DayCoverageTicket,
  dayId: string,
): boolean {
  if (!isActiveInventoryTicket(ticket)) return false
  if (isPassOrComboTicket(ticket)) return true
  return normalizeDayId(ticket.dayId) === dayId
}

/** Combos / abonos persisten sin jornada; los tickets de día llevan `event_day_id`. */
export function persistTicketDayId(
  ticket: DayCoverageTicket,
  options: { isMultiDay: boolean; validDayIds: readonly string[] },
): string | null {
  if (!options.isMultiDay || isPassOrComboTicket(ticket)) return null
  return remapBoundDayId(ticket.dayId, options.validDayIds)
}

export function uncoveredScheduleDays<T extends { id: string }>(
  days: T[],
  tickets: DayCoverageTicket[],
): T[] {
  if (days.length < 2) return []
  return days.filter(
    (day) => !tickets.some((ticket) => ticketCoversScheduleDay(ticket, day.id)),
  )
}

export function scheduleDaysMissingTicketsMessage(
  days: Array<{ id: string; title?: string | null }>,
  tickets: DayCoverageTicket[],
): string | null {
  const uncovered = uncoveredScheduleDays(days, tickets)
  if (uncovered.length === 0) return null
  const labels = uncovered.map((day) => {
    const index = days.findIndex((item) => item.id === day.id)
    return day.title?.trim() || `Jornada ${index + 1}`
  })
  return `Cada jornada necesita al menos una entrada activa. Falta configurar: ${labels.join(", ")}.`
}

export function duplicateTicketsFromDay<T extends DayCoverageTicket>(
  tickets: T[],
  sourceDayId: string,
  targetDayId: string,
): { tickets: T[]; added: number; error?: string } {
  const source = sourceDayId.trim()
  const target = targetDayId.trim()
  if (!source || !target) {
    return {
      tickets,
      added: 0,
      error: "Elegí el día de origen y el de destino.",
    }
  }
  if (source === target) {
    return {
      tickets,
      added: 0,
      error: "Elegí un día distinto para copiar las tarifas.",
    }
  }

  const existingNames = new Set(
    tickets
      .filter((ticket) => normalizeDayId(ticket.dayId) === target)
      .map((ticket) => (ticket.name ?? "").trim().toLocaleLowerCase("es"))
      .filter(Boolean),
  )

  const clones: T[] = []
  for (const ticket of tickets) {
    if (normalizeDayId(ticket.dayId) !== source) continue
    if (isPassOrComboTicket(ticket)) continue
    const nameKey = (ticket.name ?? "").trim().toLocaleLowerCase("es")
    if (nameKey && existingNames.has(nameKey)) continue
    clones.push({
      ...ticket,
      id: undefined,
      isNew: true,
      sold: 0,
      dayId: target,
      phases: (ticket.phases ?? []).map((phase) => ({
        ...phase,
        id: undefined,
        sold: 0,
      })),
    })
    if (nameKey) existingNames.add(nameKey)
  }

  if (clones.length === 0) {
    return {
      tickets,
      added: 0,
      error:
        "No hay tarifas de ese día para copiar, o ya existen en el destino.",
    }
  }

  return { tickets: [...tickets, ...clones], added: clones.length }
}
