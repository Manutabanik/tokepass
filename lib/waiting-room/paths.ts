const CHECKOUT_PASS_THROUGH = new Set([
  "/checkout/success",
  "/checkout/failure",
  "/checkout/pending",
])

export function isWaitingRoomBypassPath(pathname: string): boolean {
  if (pathname === "/waiting-room" || pathname.startsWith("/waiting-room/")) {
    return true
  }
  if (
    pathname === "/api/queue-status" ||
    pathname.startsWith("/api/queue-status/") ||
    pathname === "/api/queue/status" ||
    pathname.startsWith("/api/queue/status/")
  ) {
    return true
  }
  if (/^\/event\/[^/]+\/queue\/?$/.test(pathname)) return true
  if (/^\/events\/[^/]+\/queue\/?$/.test(pathname)) return true
  if (/^\/eventos\/[^/]+\/queue\/?$/.test(pathname)) return true
  return false
}

export function isAuthRefreshBypassPath(pathname: string): boolean {
  return isWaitingRoomBypassPath(pathname)
}

export function resolveProtectedEventKey(pathname: string): string | null {
  const eventCheckout = pathname.match(/^\/event\/([^/]+)\/checkout\/?$/)
  if (eventCheckout?.[1]) return decodePathSegment(eventCheckout[1])

  const eventsCheckout = pathname.match(/^\/events\/([^/]+)\/checkout\/?$/)
  if (eventsCheckout?.[1]) return decodePathSegment(eventsCheckout[1])

  const eventosCheckout = pathname.match(/^\/eventos\/([^/]+)\/checkout\/?$/)
  if (eventosCheckout?.[1]) return decodePathSegment(eventosCheckout[1])

  const eventos = pathname.match(/^\/eventos\/([^/]+)$/)
  if (eventos?.[1] && eventos[1] !== "preview") {
    return decodePathSegment(eventos[1])
  }

  const events = pathname.match(/^\/events\/([^/]+)$/)
  if (events?.[1] && events[1] !== "preview") {
    return decodePathSegment(events[1])
  }

  if (pathname === "/checkout") return "__checkout__"
  if (pathname.startsWith("/checkout/") && !CHECKOUT_PASS_THROUGH.has(pathname)) {
    return "__checkout__"
  }

  return null
}

export function waitingRoomUrl(
  origin: { clone: () => URL },
  eventKey: string,
  nextPath: string,
) {
  const url = origin.clone()
  url.pathname = `/event/${encodeURIComponent(eventKey)}/queue`
  url.search = ""
  url.searchParams.set("next", nextPath)
  return url
}

export function safeQueueNextPath(
  raw: unknown,
  eventKey: string,
): string {
  if (typeof raw !== "string") {
    return eventKey ? `/eventos/${eventKey}` : "/"
  }
  const path = raw.trim()
  if (!path.startsWith("/") || path.startsWith("//")) {
    return eventKey ? `/eventos/${eventKey}` : "/"
  }
  if (path.includes("://") || path.includes("\\")) {
    return eventKey ? `/eventos/${eventKey}` : "/"
  }
  return path
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value.trim()
  }
}
