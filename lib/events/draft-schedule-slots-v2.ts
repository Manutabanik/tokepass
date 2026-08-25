export type EventDraftV2ScheduleSlot = {
  id: string
  startTime: string
  endTime: string
  capacity?: number
}

export type EventDraftV2ScheduleDay = {
  id: string
  name: string
  date: string
  startDate: string
  endDate: string
  slots: EventDraftV2ScheduleSlot[]
}

export type DraftScheduleOccurrence = {
  id: string
  dayId: string
  title: string
  date: string
  startDateTime: string
  endDateTime: string
  capacity?: number
}

export type DraftScheduleSlotOption = {
  id: string
  label: string
  dayName: string
  date: string
  startTime: string
  endTime: string
}

const DATE_ONLY_RE = /^(\d{4}-\d{2}-\d{2})$/
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/
const TIME_RE = /^(\d{2}:\d{2})/

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `slot-${Math.random().toString(16).slice(2, 10)}`
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function datePartFromDateTime(value: string): string {
  const trimmed = value.trim()
  const dateOnly = DATE_ONLY_RE.exec(trimmed)
  if (dateOnly) return dateOnly[1] ?? ""
  const dateTime = DATETIME_RE.exec(trimmed)
  return dateTime?.[1] ?? ""
}

export function timePartFromDateTime(value: string): string {
  const trimmed = value.trim()
  const timeOnly = TIME_RE.exec(trimmed)
  if (timeOnly) return timeOnly[1] ?? ""
  const dateTime = DATETIME_RE.exec(trimmed)
  return dateTime?.[2] ?? ""
}

export function joinDraftDateAndTime(date: string, time: string): string {
  const day = datePartFromDateTime(date)
  const clock = timePartFromDateTime(time)
  if (!day || !clock) return day || ""
  return `${day}T${clock}`
}

export function addDraftDateDays(date: string, days: number): string {
  const day = datePartFromDateTime(date)
  if (!day) return ""
  const [year, month, dateNum] = day.split("-").map(Number)
  const next = new Date(year ?? 0, (month ?? 1) - 1, (dateNum ?? 1) + days)
  const yyyy = String(next.getFullYear()).padStart(4, "0")
  const mm = String(next.getMonth() + 1).padStart(2, "0")
  const dd = String(next.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function slotEndDateTime(
  date: string,
  startTime: string,
  endTime: string,
): string {
  const start = timePartFromDateTime(startTime)
  const end = timePartFromDateTime(endTime) || start
  if (!datePartFromDateTime(date) || !end) return ""
  if (start && end <= start) {
    return joinDraftDateAndTime(addDraftDateDays(date, 1), end)
  }
  return joinDraftDateAndTime(date, end)
}

export function createDraftScheduleSlot(
  input: Partial<EventDraftV2ScheduleSlot> = {},
): EventDraftV2ScheduleSlot {
  const capacity = Number(input.capacity)
  return {
    id: input.id?.trim() || newId(),
    startTime: input.startTime ?? "",
    endTime: input.endTime ?? "",
    ...(Number.isFinite(capacity) ? { capacity } : {}),
  }
}

export function createDraftScheduleDay(
  input: Partial<EventDraftV2ScheduleDay> = {},
): EventDraftV2ScheduleDay {
  const startDate = input.startDate ?? ""
  return {
    id: input.id?.trim() || newId(),
    name: input.name ?? "Día 1",
    date: input.date ?? datePartFromDateTime(startDate),
    startDate,
    endDate: input.endDate ?? "",
    slots: Array.isArray(input.slots)
      ? input.slots.map((slot) => createDraftScheduleSlot(slot))
      : [],
  }
}

export function syncDraftScheduleBounds(
  day: EventDraftV2ScheduleDay,
): EventDraftV2ScheduleDay {
  const slots = (day.slots ?? []).filter((slot) => slot.startTime.trim())
  const date =
    day.date.trim() ||
    datePartFromDateTime(day.startDate) ||
    datePartFromDateTime(slots[0] ? joinDraftDateAndTime(day.date, slots[0].startTime) : "")
  if (date && slots.length > 0) {
    const first = slots[0]!
    const last = slots[slots.length - 1]!
    return {
      ...day,
      date,
      slots: day.slots ?? [],
      startDate: joinDraftDateAndTime(date, first.startTime),
      endDate: last.endTime.trim()
        ? slotEndDateTime(date, last.startTime, last.endTime)
        : day.endDate,
    }
  }
  return {
    ...day,
    date: date || day.date,
    slots: day.slots ?? [],
  }
}

export function normalizeDraftScheduleDay(
  item: unknown,
  index: number,
): EventDraftV2ScheduleDay {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return createDraftScheduleDay({ name: `Día ${index + 1}` })
  }
  const record = item as Record<string, unknown>
  const startDate = asString(
    record.startDate ?? record.start_time ?? record.startTime,
  )
  const endDate = asString(record.endDate ?? record.end_time ?? record.endTime)
  const rawSlots = Array.isArray(record.slots) ? record.slots : []
  const slots = rawSlots.map((slot) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      return createDraftScheduleSlot()
    }
    const row = slot as Record<string, unknown>
    const capacity = Number(row.capacity)
    return createDraftScheduleSlot({
      id: asString(row.id),
      startTime: asString(row.startTime ?? row.start_time),
      endTime: asString(row.endTime ?? row.end_time),
      ...(Number.isFinite(capacity) ? { capacity } : {}),
    })
  })
  const date = asString(record.date) || datePartFromDateTime(startDate)
  return syncDraftScheduleBounds(
    createDraftScheduleDay({
      id: asString(record.id),
      name: asString(record.name) || `Día ${index + 1}`,
      date,
      startDate,
      endDate,
      slots,
    }),
  )
}

export function resolveNormalizedDraftSchedule(values: {
  schedule?: unknown
  basicInfo?: { startDate?: string | null; endDate?: string | null } | null
}): EventDraftV2ScheduleDay[] {
  const raw = Array.isArray(values.schedule)
    ? values.schedule.map((item, index) => normalizeDraftScheduleDay(item, index))
    : []
  const fallbackStart = values.basicInfo?.startDate?.trim() ?? ""
  const fallbackEnd = values.basicInfo?.endDate?.trim() ?? ""
  if (raw.length === 0) {
    return [
      syncDraftScheduleBounds(
        createDraftScheduleDay({
          name: "Día 1",
          startDate: fallbackStart,
          endDate: fallbackEnd,
          date: datePartFromDateTime(fallbackStart),
        }),
      ),
    ]
  }
  const hasStart = raw.some(
    (day) => day.startDate.trim() || day.date.trim() || day.slots.some((slot) => slot.startTime.trim()),
  )
  if (!hasStart && (fallbackStart || fallbackEnd)) {
    return raw.map((day, index) =>
      index === 0
        ? syncDraftScheduleBounds({
            ...day,
            startDate: day.startDate || fallbackStart,
            endDate: day.endDate || fallbackEnd,
            date: day.date || datePartFromDateTime(fallbackStart),
          })
        : day,
    )
  }
  return raw.map((day) => syncDraftScheduleBounds(day))
}

export function flattenDraftScheduleOccurrences(
  days: EventDraftV2ScheduleDay[],
): DraftScheduleOccurrence[] {
  const occurrences: DraftScheduleOccurrence[] = []
  for (const day of days) {
    const date = day.date.trim() || datePartFromDateTime(day.startDate)
    const slots = (day.slots ?? []).filter((slot) => slot.startTime.trim())
    if (date && slots.length > 0) {
      for (const slot of slots) {
        occurrences.push({
          id: slot.id || day.id,
          dayId: day.id,
          title: day.name.trim(),
          date,
          startDateTime: joinDraftDateAndTime(date, slot.startTime),
          endDateTime: slotEndDateTime(date, slot.startTime, slot.endTime),
          ...(slot.capacity != null ? { capacity: slot.capacity } : {}),
        })
      }
      continue
    }
    if (day.startDate.trim()) {
      occurrences.push({
        id: day.id,
        dayId: day.id,
        title: day.name.trim(),
        date: date || datePartFromDateTime(day.startDate),
        startDateTime: day.startDate,
        endDateTime: day.endDate || day.startDate,
      })
    }
  }
  return occurrences
}

export function listDraftScheduleSlots(
  days: EventDraftV2ScheduleDay[],
): DraftScheduleSlotOption[] {
  const options: DraftScheduleSlotOption[] = []
  for (const day of days) {
    const date = day.date.trim() || datePartFromDateTime(day.startDate)
    for (const slot of day.slots ?? []) {
      if (!slot.id.trim() || !slot.startTime.trim()) continue
      options.push({
        id: slot.id,
        dayName: day.name,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: [
          day.name.trim() || date,
          `${slot.startTime}–${slot.endTime || "—"}`,
        ]
          .filter(Boolean)
          .join(" · "),
      })
    }
  }
  return options
}

export function explicitDraftSlotCount(days: EventDraftV2ScheduleDay[]): number {
  return days.reduce(
    (count, day) =>
      count + (day.slots ?? []).filter((slot) => slot.startTime.trim()).length,
    0,
  )
}

export function draftScheduleSlotCount(days: EventDraftV2ScheduleDay[]): number {
  const explicit = explicitDraftSlotCount(days)
  return explicit > 0 ? explicit : flattenDraftScheduleOccurrences(days).length
}

export function hasMultipleDraftSlots(days: EventDraftV2ScheduleDay[]): boolean {
  return explicitDraftSlotCount(days) > 1
}

export function duplicateDraftSlotsToOtherDays(
  days: EventDraftV2ScheduleDay[],
  fromIndex: number,
): EventDraftV2ScheduleDay[] {
  const source = days[fromIndex]
  if (!source) return days
  const template = (source.slots ?? []).filter((slot) => slot.startTime.trim())
  if (template.length === 0) return days
  return days.map((day, index) => {
    if (index === fromIndex) return syncDraftScheduleBounds(day)
    return syncDraftScheduleBounds({
      ...day,
      slots: template.map((slot) =>
        createDraftScheduleSlot({
          startTime: slot.startTime,
          endTime: slot.endTime,
          ...(slot.capacity != null ? { capacity: slot.capacity } : {}),
        }),
      ),
    })
  })
}

export function groupLiveDaysIntoDraftSchedule(
  days: Array<{
    id: string
    title: string
    startLocal: string
    endLocal: string
  }>,
): EventDraftV2ScheduleDay[] {
  const groups = new Map<string, EventDraftV2ScheduleDay>()
  const order: string[] = []
  for (const day of days) {
    const date = datePartFromDateTime(day.startLocal)
    const key = date || day.id
    const slot = createDraftScheduleSlot({
      id: day.id,
      startTime: timePartFromDateTime(day.startLocal),
      endTime: timePartFromDateTime(day.endLocal),
    })
    const current = groups.get(key)
    if (current) {
      current.slots.push(slot)
      groups.set(key, syncDraftScheduleBounds(current))
      continue
    }
    order.push(key)
    groups.set(
      key,
      syncDraftScheduleBounds(
        createDraftScheduleDay({
          id: day.id,
          name: day.title,
          date,
          startDate: day.startLocal,
          endDate: day.endLocal,
          slots: [slot],
        }),
      ),
    )
  }
  return order.map((key) => groups.get(key)).filter((day): day is EventDraftV2ScheduleDay => Boolean(day))
}
