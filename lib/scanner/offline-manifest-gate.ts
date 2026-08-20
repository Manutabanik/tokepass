import { isTicketValidForNow } from "@/lib/event-schedule"
import type { ScheduleDay } from "@/types/events"

export type OfflineManifestGateReason =
  | "transfer_pending"
  | "listed_for_resale"
  | "wrong_schedule"

export type OfflineManifestGateResult =
  | { ok: true }
  | { ok: false; reason: OfflineManifestGateReason; message: string }

/**
 * Re-evalua el manifiesto local: cesiones, reventa y ventana de jornada.
 * No admite boletos en transferencia, listados ni fuera de `event_schedules`.
 */
export function evaluateOfflineManifestGate(input: {
  pendingTransfer?: boolean | null
  listedForResale?: boolean | null
  dayId?: string | null
  scheduleDays?: ScheduleDay[] | null
  eventDate?: string | null
  now?: Date
}): OfflineManifestGateResult {
  if (input.pendingTransfer) {
    return {
      ok: false,
      reason: "transfer_pending",
      message: "Transferencia pendiente. El QR esta bloqueado hasta que se complete o cancele la cesion.",
    }
  }

  if (input.listedForResale) {
    return {
      ok: false,
      reason: "listed_for_resale",
      message: "Entrada en reventa. El QR esta bloqueado hasta que se retire o se venda.",
    }
  }

  const dayGate = isTicketValidForNow({
    now: input.now,
    scheduleDays: input.scheduleDays ?? [],
    dayId: input.dayId,
    eventDate: input.eventDate,
  })
  if (!dayGate.ok) {
    return {
      ok: false,
      reason: "wrong_schedule",
      message: dayGate.message,
    }
  }

  return { ok: true }
}
