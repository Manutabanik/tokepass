import "server-only"

import { getEmailAppUrl, sendOpsAlertEmail } from "@/lib/email/resend"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"

export type OpsAlertKind =
  | "event_pending_approval"
  | "support_message"

export async function notifyOpsAlert(input: {
  kind: OpsAlertKind
  title: string
  body: string
  href?: string
}) {
  try {
    const admin = createAdminClient()
    const { data: owners } = await admin
      .from("profiles")
      .select("email")
      .eq("role", "super_admin")

    const emails = (owners ?? [])
      .map((row) => row.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email && email.includes("@")))

    const extra = process.env.TOKEPASS_SUPERADMIN_EMAIL?.trim().toLowerCase()
    if (extra && extra.includes("@") && !emails.includes(extra)) {
      emails.push(extra)
    }

    const appUrl = getEmailAppUrl()
    const href = input.href
      ? `${appUrl}${input.href.startsWith("/") ? input.href : `/${input.href}`}`
      : `${appUrl}/superadmin`

    await Promise.all(
      emails.map((to) =>
        sendOpsAlertEmail({
          to,
          subject: input.title,
          text: `${input.body}\n\n${href}`,
        }),
      ),
    )

    const webhook = process.env.TOKEPASS_OPS_WEBHOOK_URL?.trim()
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: input.kind,
          title: input.title,
          body: input.body,
          href,
        }),
      }).catch((error) => {
        logger.error({
          context: "ops-alert",
          message: "webhook_failed",
          error,
        })
      })
    }
  } catch (error) {
    logger.error({
      context: "ops-alert",
      message: "notify_failed",
      kind: input.kind,
      error,
    })
  }
}
