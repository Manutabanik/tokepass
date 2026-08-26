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
] as const

export type TerminalOfflineSyncCode = (typeof TERMINAL_OFFLINE_SYNC_CODES)[number]

/** Conflictos definitivos: no reintentar; evictar de la cola local. */
export function isTerminalOfflineSyncConflict(reason: string): boolean {
  const code = reason.trim().toLowerCase()
  return (TERMINAL_OFFLINE_SYNC_CODES as readonly string[]).includes(code)
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
