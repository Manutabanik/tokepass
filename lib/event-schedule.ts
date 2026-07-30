import type { ScheduleDay } from "@/types/events"
import { TICKET_DAY_ALL, type TicketDayId } from "@/types/tickets"

export function isFullPassDayId(dayId: TicketDayId | undefined): boolean {
  return dayId == null || dayId === "" || dayId === TICKET_DAY_ALL
}

export function normalizeDayId(
  dayId: TicketDayId | undefined,
): string | null {
  if (isFullPassDayId(dayId)) return null
  return String(dayId).trim() || null
}

export function parseScheduleDays(raw: unknown): ScheduleDay[] {
  if (!Array.isArray(raw)) return []
  const days: ScheduleDay[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? "").trim()
    const title = String(row.title ?? "").trim()
    const start = String(row.start_time ?? "").trim()
    const end = String(row.end_time ?? "").trim()
    if (!id || !title || !start || !end) continue
    if (Number.isNaN(new Date(start).getTime())) continue
    if (Number.isNaN(new Date(end).getTime())) continue
    days.push({ id, title, start_time: start, end_time: end })
  }
  return days
}

export function resolveEventAnchorDate(
  scheduleDays: ScheduleDay[],
  fallbackDate: string,
): string {
  if (scheduleDays.length === 0) return fallbackDate
  const sorted = [...scheduleDays].sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  )
  return sorted[0]?.start_time ?? fallbackDate
}

export function findScheduleDay(
  scheduleDays: ScheduleDay[],
  dayId: TicketDayId | undefined,
): ScheduleDay | null {
  const normalized = normalizeDayId(dayId)
  if (!normalized) return null
  return scheduleDays.find((day) => day.id === normalized) ?? null
}

/**
 * Admission window for a ticket:
 * - single-day event / empty schedule → always eligible (date gate is soft)
 * - abono (null day_id) → any schedule day window
 * - day-bound → only that day's [start, end]
 */
export function isTicketValidForNow(input: {
  now?: Date
  scheduleDays: ScheduleDay[]
  dayId: TicketDayId | undefined
  eventDate?: string | null
}): { ok: true } | { ok: false; message: string } {
  const now = input.now ?? new Date()
  const days = input.scheduleDays

  if (days.length === 0) {
    return { ok: true }
  }

  const dayBound = findScheduleDay(days, input.dayId)
  if (dayBound) {
    const start = new Date(dayBound.start_time).getTime()
    const end = new Date(dayBound.end_time).getTime()
    const ts = now.getTime()
    if (ts < start) {
      return {
        ok: false,
        message: `Esta entrada es válida solo para "${dayBound.title}" (aún no abre)`,
      }
    }
    if (ts > end) {
      return {
        ok: false,
        message: `Esta entrada es válida solo para "${dayBound.title}" (jornada cerrada)`,
      }
    }
    return { ok: true }
  }

  if (!isFullPassDayId(input.dayId)) {
    return {
      ok: false,
      message: "La jornada de esta entrada no existe en el evento",
    }
  }

  const inAnyWindow = days.some((day) => {
    const start = new Date(day.start_time).getTime()
    const end = new Date(day.end_time).getTime()
    const ts = now.getTime()
    return ts >= start && ts <= end
  })

  if (!inAnyWindow) {
    return {
      ok: false,
      message: "Abono fuera de las jornadas habilitadas para ingreso",
    }
  }

  return { ok: true }
}

export function formatDayValidityLabel(input: {
  scheduleDays: ScheduleDay[]
  dayId: TicketDayId | undefined
  eventTitle?: string
}): string | null {
  const days = input.scheduleDays
  if (days.length === 0) return null

  const day = findScheduleDay(days, input.dayId)
  if (day) {
    return `Válido solo · ${day.title}`
  }

  if (isFullPassDayId(input.dayId)) {
    return "Abono completo · todas las jornadas"
  }

  return null
}
