export const SCANNER_BLACKLIST_TICKET_STATUSES = [
  "refunded",
  "cancelled",
  "revoked",
] as const

export type ScannerBlacklistTicketStatus =
  (typeof SCANNER_BLACKLIST_TICKET_STATUSES)[number]

export function isScannerBlacklistTicketStatus(
  status: string | null | undefined,
): status is ScannerBlacklistTicketStatus {
  const value = (status ?? "").trim().toLowerCase()
  return (SCANNER_BLACKLIST_TICKET_STATUSES as readonly string[]).includes(value)
}

export function isDeniedAdmissionTicketStatus(
  status: string | null | undefined,
): boolean {
  const value = (status ?? "").trim().toLowerCase()
  return (
    isScannerBlacklistTicketStatus(value) ||
    value === "pending_payment" ||
    value === "transferred"
  )
}

export function parseScannerBlacklistPayload(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { ticket_ids?: unknown }).ticket_ids)
      ? (raw as { ticket_ids: unknown[] }).ticket_ids
      : []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const id = typeof value === "string" ? value.trim() : ""
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}
