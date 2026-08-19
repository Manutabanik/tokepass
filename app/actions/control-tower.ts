"use server"

import {
  listPendingAuditEvents,
  type AuditEventRow,
} from "@/app/actions/event-audit"
import { countUnreadSupportForAdmin } from "@/app/actions/support"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type ControlTowerSnapshot = {
  pendingCount: number
  unreadSupportCount: number
  pendingPayoutCount: number
  pendingEvents: AuditEventRow[]
}

export async function getControlTowerSnapshot(): Promise<ControlTowerSnapshot> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error("Debes iniciar sesión.")
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    throw new Error("Acceso restringido al super administrador.")
  }

  const admin = createAdminClient()
  const [{ count }, pendingEvents, unreadSupportCount, payouts] =
    await Promise.all([
      admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_approval"),
      listPendingAuditEvents(),
      countUnreadSupportForAdmin(),
      admin
        .from("event_payouts")
        .select("id", { count: "exact", head: true })
        .in("payout_status", ["hold", "pending_approval", "processing"]),
    ])

  return {
    pendingCount: count ?? pendingEvents.length,
    unreadSupportCount,
    pendingPayoutCount: payouts.error ? 0 : (payouts.count ?? 0),
    pendingEvents,
  }
}
