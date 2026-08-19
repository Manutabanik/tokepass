import "server-only"

import { sendEventAuditEmail } from "@/lib/email/resend"
import { notifyOpsAlert } from "@/lib/ops/notify-ops"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"

export async function notifyOrganizerEventAudit(input: {
  eventId: string
  kind: "submitted" | "approved" | "needs_revision" | "rejected"
  note?: string | null
}) {
  try {
    const admin = createAdminClient()
    const { data: event } = await admin
      .from("events")
      .select("title, organizer_id")
      .eq("id", input.eventId)
      .maybeSingle()
    if (!event) return

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, public_name, email")
      .eq("id", event.organizer_id)
      .maybeSingle()
    if (!profile?.email) return

    await sendEventAuditEmail({
      to: profile.email,
      organizerName: profile.public_name?.trim() || profile.full_name?.trim() || "",
      eventTitle: event.title,
      kind: input.kind,
      note: input.note,
    })

    if (input.kind === "submitted") {
      void notifyOpsAlert({
        kind: "event_pending_approval",
        title: `Evento en revisión: ${event.title}`,
        body: `${profile.public_name?.trim() || profile.full_name?.trim() || "Un organizador"} envió “${event.title}” a auditoría.`,
        href: "/superadmin",
      })
    }
  } catch (error) {
    logger.error({
      context: "event-audit",
      message: "notify_failed",
      eventId: input.eventId,
      error,
    })
  }
}
