export function ticketBackupCode(ticketId: string): string {
  return ticketId.replace(/-/g, "").slice(0, 12).toUpperCase()
}
