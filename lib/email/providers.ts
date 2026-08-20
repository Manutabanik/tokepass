import "server-only"

import { createHash } from "crypto"

import { sanitizeEmailSubject } from "@/lib/email/sanitize"
import { logger } from "@/lib/logger"
import { circuitFetch } from "@/lib/resilience/circuit-breaker"

function hashEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 16)
}

export type TransactionalEmailInput = {
  to: string
  subject: string
  text: string
  html?: string
}

function resendFromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "TokePass <entradas@tokepass.com>"
  )
}

function parseFromAddress(value: string): { email: string; name?: string } {
  const match = value.match(/^(.*)<([^>]+)>$/)
  if (!match) {
    return { email: value.trim() }
  }
  return {
    name: match[1].trim() || undefined,
    email: match[2].trim(),
  }
}

export async function postNotificationWebhook(
  channel: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL?.trim()
  if (!webhookUrl) return false

  const response = await circuitFetch("whatsapp", webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ...body }),
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    throw new Error(`notification_webhook_${response.status}`)
  }
  return true
}

async function sendViaResend(input: TransactionalEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("resend_not_configured")
  }

  const response = await circuitFetch("resend", "https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromAddress(),
      to: [input.to],
      subject: sanitizeEmailSubject(input.subject),
      text: input.text,
      html: input.html,
    }),
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`resend_${response.status} ${body.slice(0, 180)}`)
  }
}

async function sendViaSendGrid(input: TransactionalEmailInput): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("sendgrid_not_configured")
  }

  const from = parseFromAddress(resendFromAddress())
  const content: { type: string; value: string }[] = [
    { type: "text/plain", value: input.text },
  ]
  if (input.html) {
    content.push({ type: "text/html", value: input.html })
  }

  const response = await circuitFetch(
    "sendgrid",
    "https://api.sendgrid.com/v3/mail/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: {
          email: from.email,
          ...(from.name ? { name: from.name } : {}),
        },
        subject: sanitizeEmailSubject(input.subject),
        content,
      }),
      signal: AbortSignal.timeout(8000),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`sendgrid_${response.status} ${body.slice(0, 180)}`)
  }
}

/**
 * Email primario: Resend. Secundario: SendGrid. Terciario: webhook ops.
 */
export async function sendEmailWithFailover(
  input: TransactionalEmailInput,
  options?: { skipPrimary?: boolean },
): Promise<void> {
  const email = input.to.trim().toLowerCase()
  if (!email || !email.includes("@")) {
    throw new Error("invalid_recipient")
  }

  const payload: TransactionalEmailInput = {
    ...input,
    to: email,
    subject: sanitizeEmailSubject(input.subject),
  }

  const errors: string[] = []

  if (!options?.skipPrimary) {
    try {
      await sendViaResend(payload)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : "resend_failed"
      if (message !== "resend_not_configured") {
        errors.push(message)
      }
    }
  }

  try {
    await sendViaSendGrid(payload)
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : "sendgrid_failed"
    if (message !== "sendgrid_not_configured") {
      errors.push(message)
    }
  }

  try {
    if (
      await postNotificationWebhook("email", {
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      })
    ) {
      return
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "webhook_failed")
  }

  logger.error({
    context: "email/providers",
    message: "email_failover_exhausted",
    to_hash: hashEmail(payload.to),
    errors,
  })
  throw new Error(errors[0] || "email_providers_unavailable")
}
