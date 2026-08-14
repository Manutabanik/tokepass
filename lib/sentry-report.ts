import * as Sentry from "@sentry/nextjs"

import { scrubSensitiveValue } from "@/lib/sentry/privacy"

/**
 * Forwards structured error logs to Sentry via the official SDK.
 * Extra metadata is scrubbed so passwords, tokens and PAN never leave the host.
 */
export function reportErrorToSentry(payload: {
  message: string
  context: string
  stack?: string
  extra?: Record<string, unknown>
}) {
  const extra = payload.extra
    ? (scrubSensitiveValue(payload.extra) as Record<string, unknown>)
    : undefined

  Sentry.captureException(new Error(payload.message), {
    tags: { context: payload.context },
    extra: extra
      ? { ...extra, ...(payload.stack ? { stack: payload.stack } : {}) }
      : payload.stack
        ? { stack: payload.stack }
        : undefined,
  })
}
