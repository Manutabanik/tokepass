import type { EventStatus, UserRole } from "@/types/database"

/**
 * Mirrors `should_enforce_transfer_ticket_cap` in P208.
 * The live gate is the SQL RPC; this keeps the same rule in app tests.
 */
export function shouldEnforceTransferTicketCap(input: {
  ticketIsTest?: boolean | null
  eventStatus?: EventStatus | string | null
  receiverRole?: UserRole | string | null
}): boolean {
  if (input.ticketIsTest) return false
  if (
    input.receiverRole === "admin" ||
    input.receiverRole === "super_admin"
  ) {
    return false
  }
  return input.eventStatus === "published"
}
