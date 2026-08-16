const CHECKOUT_PASS_THROUGH = new Set([
  "/checkout/success",
  "/checkout/failure",
  "/checkout/pending",
])

export function isWaitingRoomBypassPath(pathname: string): boolean {
  if (pathname === "/waiting-room" || pathname.startsWith("/waiting-room/")) {
    return true
  }
  if (pathname === "/api/queue-status" || pathname.startsWith("/api/queue-status/")) {
    return true
  }
  return false
}

export function isAuthRefreshBypassPath(pathname: string): boolean {
  return isWaitingRoomBypassPath(pathname)
}

export function resolveProtectedEventKey(pathname: string): string | null {
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
  url.pathname = "/waiting-room"
  url.search = ""
  url.searchParams.set("event", eventKey)
  url.searchParams.set("next", nextPath)
  return url
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value.trim()
  }
}
