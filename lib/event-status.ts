import { resolveTicketCommerceType } from "@/lib/events/ticket-commerce-type"
import { parseScheduleDays } from "@/lib/event-schedule"
import type { ScheduleDay } from "@/types/events"

export type EventTimingInput = {
  date: string
  endsAt?: string | null
  scheduleDays?: ScheduleDay[] | unknown | null
}

export type EventInventoryInput = {
  capacity?: number | null
  sold?: number | null
  ticketsLeft?: number | null
  tiers?: Array<{
    capacity: number
    sold: number
    available?: number
    visibility?: string | null
    ticket_type?: string | null
    ticketType?: string | null
    tier_type?: string | null
    tierType?: string | null
    category?: string | null
    layout_type?: string | null
  }> | null
}

/** Inicio comercial: primera jornada, o `date` del evento. */
export function resolveEventStartAt(
  event: EventTimingInput,
): Date | null {
  const days = Array.isArray(event.scheduleDays)
    ? event.scheduleDays.every(
        (item) =>
          item &&
          typeof item === "object" &&
          "end_time" in item &&
          "start_time" in item,
      )
      ? (event.scheduleDays as ScheduleDay[])
      : parseScheduleDays(event.scheduleDays)
    : parseScheduleDays(event.scheduleDays)

  if (days.length > 0) {
    let earliest = Number.POSITIVE_INFINITY
    for (const day of days) {
      const ms = new Date(day.start_time).getTime()
      if (Number.isFinite(ms) && ms < earliest) earliest = ms
    }
    if (Number.isFinite(earliest)) return new Date(earliest)
  }

  const start = new Date(event.date)
  if (Number.isNaN(start.getTime())) return null
  return start
}

/** Instantánea de cierre: último end de jornada, `ends_at`, o el inicio del evento. */
export function resolveEventEndAt(
  event: EventTimingInput,
  now: Date = new Date(),
): Date | null {
  void now
  const days = Array.isArray(event.scheduleDays)
    ? event.scheduleDays.every(
        (item) =>
          item &&
          typeof item === "object" &&
          "end_time" in item &&
          "start_time" in item,
      )
      ? (event.scheduleDays as ScheduleDay[])
      : parseScheduleDays(event.scheduleDays)
    : parseScheduleDays(event.scheduleDays)

  if (days.length > 0) {
    let latest = 0
    for (const day of days) {
      const ms = new Date(day.end_time).getTime()
      if (Number.isFinite(ms) && ms > latest) latest = ms
    }
    if (latest > 0) return new Date(latest)
  }

  if (event.endsAt) {
    const end = new Date(event.endsAt)
    if (!Number.isNaN(end.getTime())) return end
  }

  const start = new Date(event.date)
  if (Number.isNaN(start.getTime())) return null
  return start
}

export function isPastEvent(
  event: EventTimingInput,
  now: Date = new Date(),
): boolean {
  const end = resolveEventEndAt(event, now)
  if (!end) return false
  return end.getTime() < now.getTime()
}

export function isSoldOut(event: EventInventoryInput): boolean {
  if (event.ticketsLeft != null) {
    return event.ticketsLeft <= 0
  }

  const visible = (event.tiers ?? []).filter(
    (tier) => (tier.visibility ?? "public") !== "private",
  )
  const admissions = visible.filter(
    (tier) => resolveTicketCommerceType(tier) !== "extra",
  )
  if (visible.length > 0 && admissions.length === 0) {
    return true
  }

  if (admissions.length > 0) {
    const available = admissions.reduce((sum, tier) => {
      if (typeof tier.available === "number") {
        return sum + Math.max(0, tier.available)
      }
      return sum + Math.max(0, Number(tier.capacity) - Number(tier.sold))
    }, 0)
    return available <= 0
  }

  const capacity = Number(event.capacity ?? 0)
  const sold = Number(event.sold ?? 0)
  if (capacity <= 0) return false
  return sold >= capacity
}

export type DerivedEventSaleState = "live" | "sold_out" | "finished"

export function deriveEventSaleState(
  event: EventTimingInput & EventInventoryInput,
  now: Date = new Date(),
): DerivedEventSaleState {
  if (isPastEvent(event, now)) return "finished"
  if (isSoldOut(event)) return "sold_out"
  return "live"
}
