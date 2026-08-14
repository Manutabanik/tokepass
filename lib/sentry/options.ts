import { scrubSentryEvent } from "@/lib/sentry/privacy"

export function getSentryDsn(): string | undefined {
  const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (publicDsn) return publicDsn
  return process.env.SENTRY_DSN?.trim() || undefined
}

export function getSentryInitOptions() {
  const dsn = getSentryDsn()

  return {
    dsn,
    enabled: Boolean(dsn),
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend<T>(event: T) {
      return scrubSentryEvent(event)
    },
  }
}
