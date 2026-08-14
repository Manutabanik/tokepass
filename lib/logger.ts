import { reportErrorToSentry } from "@/lib/sentry-report"

type LogLevel = "error" | "warn" | "info"

export type LogFields = {
  context: string
  message?: string
  order_id?: string | null
  payment_id?: string | null
  event_id?: string | null
  error?: unknown
  stack?: string
  [key: string]: unknown
}

function serializeError(error: unknown): {
  message: string
  stack?: string
  name?: string
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  if (typeof error === "string") {
    return { message: error }
  }
  try {
    return { message: JSON.stringify(error) }
  } catch {
    return { message: String(error) }
  }
}

function emit(level: LogLevel, fields: LogFields) {
  const { error, stack, message, context, ...rest } = fields
  const serialized = error != null ? serializeError(error) : null

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message: message ?? serialized?.message ?? undefined,
    stack: stack ?? serialized?.stack,
    error: serialized
      ? { name: serialized.name, message: serialized.message }
      : undefined,
    ...rest,
  }

  const line = JSON.stringify(payload)

  if (level === "error") {
    console.error(line)
    reportErrorToSentry({
      message: String(payload.message ?? "error"),
      context,
      stack: payload.stack,
      extra: rest as Record<string, unknown>,
    })
  } else if (level === "warn") {
    console.warn(line)
  } else {
    console.info(line)
  }
}

/**
 * Structured JSON logger for production observability (Sentry via NEXT_PUBLIC_SENTRY_DSN).
 * Emits one JSON object per line — no business-logic coupling.
 */
export const logger = {
  info(fields: LogFields) {
    emit("info", fields)
  },
  warn(fields: LogFields) {
    emit("warn", fields)
  },
  error(fields: LogFields) {
    emit("error", fields)
  },
}
