import "server-only"

import { SCANNER_BLACKLIST_TICKET_STATUSES } from "@/lib/scanner/ticket-blacklist"
import type { ScannerDb } from "@/lib/scanner/resolve-scanner-access"

const PAGE_SIZE = 1000

export async function loadEventTicketBlacklistIds(
  db: ScannerDb,
  eventId: string,
): Promise<string[]> {
  const ids: string[] = []
  const seen = new Set<string>()
  let from = 0

  while (true) {
    const { data, error } = await db
      .from("tickets")
      .select("id")
      .eq("event_id", eventId)
      .in("status", [...SCANNER_BLACKLIST_TICKET_STATUSES])
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const rows = data ?? []
    for (const row of rows) {
      const id = String(row.id ?? "").trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return ids
}
