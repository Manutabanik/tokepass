import "server-only"

import { assertEventOpsAccess } from "@/lib/event-ops-access"
import { readValidDoorGuestSession } from "@/lib/scanner/door-guest-session"
import { createAdminClient, tryCreateAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type ScannerDb =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>

export type ScannerActor =
  | {
      ok: true
      mode: "account"
      userId: string
      isOrganizer: boolean
      db: Awaited<ReturnType<typeof createClient>>
      validatedBy: string
    }
  | {
      ok: true
      mode: "guest"
      organizerId: string
      eventId: string
      db: ReturnType<typeof createAdminClient>
      validatedBy: string
    }
  | { ok: false; reason: "auth_required" | "forbidden" }

export async function resolveScannerActor(
  eventId: string,
): Promise<ScannerActor> {
  const account = await assertEventOpsAccess(eventId, ["door_staff"])
  if (account.ok) {
    return {
      ok: true,
      mode: "account",
      userId: account.userId,
      isOrganizer: account.isOrganizer,
      db: tryCreateAdminClient() ?? (await createClient()),
      validatedBy: account.userId,
    }
  }

  const guest = await readValidDoorGuestSession()
  if (!guest || guest.eventId !== eventId) {
    return { ok: false, reason: account.reason }
  }

  return {
    ok: true,
    mode: "guest",
    organizerId: guest.organizerId,
    eventId: guest.eventId,
    db: createAdminClient(),
    validatedBy: guest.organizerId,
  }
}
