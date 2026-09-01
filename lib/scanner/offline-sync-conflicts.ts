import { isScanReplayCode } from "@/lib/scanner/scan-replay"

const TERMINAL_OFFLINE_SYNC_CODES = [
  "invalid_status",
  "unpaid",
  "cancelled",
  "refunded",
  "transferred",
  "revoked",
  "test_ticket",
  "not_found",
  "wrong_event",
  "already_used",
  "already_used_today",
] as const

export type TerminalOfflineSyncCode = (typeof TERMINAL_OFFLINE_SYNC_CODES)[number]

/** Conflictos definitivos: no reintentar; evictar de la cola local. */
export function isTerminalOfflineSyncConflict(reason: string): boolean {
  const code = reason.trim().toLowerCase()
  return (TERMINAL_OFFLINE_SYNC_CODES as readonly string[]).includes(code)
}

export type OfflineSyncAdmissionOutcome =
  | { kind: "synced" }
  | { kind: "evict" }
  | { kind: "evict_conflict"; reason: string }
  | { kind: "retry"; reason: string }

/**
 * already_used en la 1ª admisión = otra puerta ya lo usó: terminal + alerta.
 * already_used después de una admisión OK = tope local, no es fantasma.
 */
export function resolveOfflineSyncAdmission(
  admitted: number,
  error: string | null,
): OfflineSyncAdmissionOutcome {
  if (!error) return { kind: "synced" }
  const reason = error.trim()
  if (isScanReplayCode(reason) && admitted > 0) {
    return { kind: "synced" }
  }
  if (isTerminalOfflineSyncConflict(reason)) {
    if (isScanReplayCode(reason)) {
      return { kind: "evict_conflict", reason }
    }
    return { kind: "evict" }
  }
  return { kind: "retry", reason }
}

export function isSupervisorOfflineSyncAlert(reason: string): boolean {
  return isScanReplayCode(reason)
}

export function offlineSyncConflictCopy(reason: string): string {
  if (isScanReplayCode(reason)) {
    return "Ya ingresó por otra puerta"
  }
  return "Conflicto de sync"
}

export function overlayKindFromDeniedScanStatus(
  status: string,
):
  | "duplicate"
  | "invalid"
  | "test_ticket"
  | "wrong_sector"
  | "transfer_pending"
  | "listed_for_resale"
  | "wrong_schedule"
  | "cancelled"
  | "unpaid"
  | "transferred"
  | "expired_qr" {
  switch (status) {
    case "already_used":
    case "already_used_today":
      return "duplicate"
    case "wrong_sector":
      return "wrong_sector"
    case "transfer_pending":
      return "transfer_pending"
    case "listed_for_resale":
      return "listed_for_resale"
    case "wrong_day":
      return "wrong_schedule"
    case "test_ticket":
    case "test_ticket_live":
      return "test_ticket"
    case "cancelled":
    case "refunded":
    case "revoked":
      return "cancelled"
    case "unpaid":
      return "unpaid"
    case "transferred":
      return "transferred"
    case "expired_qr":
      return "expired_qr"
    default:
      return "invalid"
  }
}
