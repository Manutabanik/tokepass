import { scrubSentryEvent } from "@/lib/sentry/privacy"

export function getSentryDsn(): string | undefined {
  const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (publicDsn) return publicDsn
  return process.env.SENTRY_DSN?.trim() || undefined
}

export function getSentryTracesSampleRate(): number {
  return process.env.NODE_ENV === "production" ? 0.1 : 1.0
}

export function getSentryReplaySessionSampleRate(): number {
  return process.env.NODE_ENV === "production" ? 0.05 : 1.0
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
    beforeSend<T>(event: T) {
      return scrubSentryEvent(event)
    },
  }
}
