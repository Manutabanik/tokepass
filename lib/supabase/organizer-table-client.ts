import "server-only"

import { tryCreateAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Lecturas de events/tickets en el panel. El JWT del usuario sigue
 * autenticando; el service-role evita el ciclo RLS events↔tickets (42P17).
 * Toda query debe filtrar por organizer_id o ids ya autorizados.
 */
export async function organizerTableClient() {
  const userClient = await createClient()
  const table = tryCreateAdminClient() ?? userClient
  return { userClient, table }
}

export function isEventsRlsRecursion(message: string | undefined) {
  return /42P17|infinite recursion detected in policy for relation ["']events["']/i.test(
    message ?? "",
  )
}
