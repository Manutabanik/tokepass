const REDACTED = "[Filtered]"

const SENSITIVE_KEY =
  /password|passwd|secret|token|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|card[_-]?number|credit[_-]?card|^pan$|cvv|cvc|ccv|otp|cookie|set-cookie|service[_-]?role|private[_-]?key|bearer|^dni$|holder_dni|cuil|cuit|email|^to$|phone|telefono|holder_email|holder_name/i

const CARD_NUMBER = /\b(?:\d[ \-]*){13,19}\b/g
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\b/g

function scrubString(value: string): string {
  return value.replace(CARD_NUMBER, REDACTED).replace(JWT_LIKE, REDACTED)
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key)
}

export function scrubSensitiveValue(value: unknown, key = ""): unknown {
  if (isSensitiveKey(key)) {
    return REDACTED
  }

  if (typeof value === "string") {
    return scrubString(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitiveValue(item, key))
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      next[childKey] = scrubSensitiveValue(childValue, childKey)
    }
    return next
  }

  return value
}

type MutableSentryEvent = {
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  tags?: Record<string, unknown>
  user?: Record<string, unknown> | null
  request?: {
    cookies?: unknown
    headers?: Record<string, unknown>
    data?: unknown
    query_string?: unknown
  }
  breadcrumbs?: { values?: Array<{ message?: string; data?: unknown }> }
}

export function scrubSentryEvent<T>(event: T): T {
  const next = event as T & MutableSentryEvent

  if (next.extra) {
    next.extra = scrubSensitiveValue(next.extra) as Record<string, unknown>
  }
  if (next.contexts) {
    next.contexts = scrubSensitiveValue(next.contexts) as Record<string, unknown>
  }
  if (next.tags) {
    next.tags = scrubSensitiveValue(next.tags) as Record<string, unknown>
  }
  if (next.user) {
    const user = { ...next.user }
    delete user.email
    delete user.ip_address
    delete user.username
    next.user = scrubSensitiveValue(user) as Record<string, unknown>
  }

  if (next.request) {
    const request = { ...next.request }
    delete request.cookies
    delete request.data
    if (request.headers && typeof request.headers === "object") {
      const headers = { ...request.headers }
      for (const header of Object.keys(headers)) {
        if (isSensitiveKey(header) || /cookie|auth/i.test(header)) {
          headers[header] = REDACTED
        }
      }
      request.headers = headers
    }
    next.request = request
  }

  if (next.breadcrumbs?.values) {
    next.breadcrumbs = {
      ...next.breadcrumbs,
      values: next.breadcrumbs.values.map((crumb) => ({
        ...crumb,
        message:
          typeof crumb.message === "string"
            ? scrubString(crumb.message)
            : crumb.message,
        data: crumb.data
          ? (scrubSensitiveValue(crumb.data) as typeof crumb.data)
          : crumb.data,
      })),
    }
  }

  return next
}
