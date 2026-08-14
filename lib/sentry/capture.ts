import * as Sentry from "@sentry/nextjs"

export function captureCriticalException(
  error: unknown,
  context: string,
  tags?: Record<string, string | undefined>,
) {
  const cleaned: Record<string, string> = { context }

  if (tags) {
    for (const [key, value] of Object.entries(tags)) {
      if (!value) continue
      cleaned[key] = value
    }
  }

  Sentry.captureException(error, { tags: cleaned })
}
