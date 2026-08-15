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

const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/

export type ScheduleDayFormValue = {
  id: string
  title: string
  startTime: string
  endTime: string
}

export function parseDateTimeLocal(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const match = DATETIME_LOCAL_RE.exec(trimmed)
  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] ?? 0),
    )
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function toDatetimeLocalInput(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(" ", "T")
}

export function newScheduleDayId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `day-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readScheduleDayField(
  row: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export function parseScheduleDays(raw: unknown): ScheduleDay[] {
  if (typeof raw === "string") {
    try {
      return parseScheduleDays(JSON.parse(raw) as unknown)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  const days: ScheduleDay[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const startRaw = readScheduleDayField(row, "start_time", "startTime")
    const endRaw = readScheduleDayField(row, "end_time", "endTime")
    const start = parseDateTimeLocal(startRaw) ?? new Date(startRaw)
    const end = parseDateTimeLocal(endRaw) ?? new Date(endRaw)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    if (end.getTime() <= start.getTime()) continue
    const title =
      readScheduleDayField(row, "title", "name", "label") ||
      `Día ${days.length + 1}`
    const id = readScheduleDayField(row, "id") || newScheduleDayId()
    days.push({
      id,
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    })
  }
  return days.sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  )
}

export function scheduleDaysToFormValues(
  days: ScheduleDay[],
): ScheduleDayFormValue[] {
  return days.map((day) => ({
    id: day.id,
    title: day.title,
    startTime: toDatetimeLocalInput(day.start_time),
    endTime: toDatetimeLocalInput(day.end_time),
  }))
}

export function normalizeScheduleDaysFromForm(
  days: Array<Partial<ScheduleDayFormValue> | ScheduleDay | null | undefined>,
): ScheduleDay[] {
  return parseScheduleDays(
    days.map((day) => {
      if (!day) return null
      const row = day as Record<string, unknown>
      return {
        id: row.id,
        title: row.title,
        start_time: row.start_time ?? row.startTime,
        end_time: row.end_time ?? row.endTime,
      }
    }),
  )
}

export function seedTwoScheduleDays(startLocal: string): ScheduleDayFormValue[] {
  const start = parseDateTimeLocal(startLocal) ?? new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const windowMs = 8 * 60 * 60 * 1000
  const day2 = new Date(start.getTime() + dayMs)
  return [
    {
      id: newScheduleDayId(),
      title: "Día 1",
      startTime: toDatetimeLocalInput(start),
      endTime: toDatetimeLocalInput(new Date(start.getTime() + windowMs)),
    },
    {
      id: newScheduleDayId(),
      title: "Día 2",
      startTime: toDatetimeLocalInput(day2),
      endTime: toDatetimeLocalInput(new Date(day2.getTime() + windowMs)),
    },
  ]
}

export function isMultiDaySchedule(days: ScheduleDay[]): boolean {
  return days.length >= 2
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
