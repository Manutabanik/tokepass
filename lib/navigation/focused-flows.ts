/** Flujos a pantalla completa: la bottom nav global no debe competir. */

export function isVenueMapWorkspace(pathname: string): boolean {
  return /^\/admin\/events\/[^/]+\/edit\/?$/.test(pathname)
}

export function isAdminFocusedFlow(pathname: string): boolean {
  if (pathname.startsWith("/admin/pos")) return true
  if (pathname.startsWith("/dashboard/pos")) return true
  if (pathname.startsWith("/admin/scanner")) return true
  if (pathname.startsWith("/admin/validator")) return true
  if (pathname.startsWith("/admin/store-scanner")) return true
  if (pathname.startsWith("/admin/bar-scanner")) return true
  if (pathname.startsWith("/admin/events/create")) return true
  if (pathname.startsWith("/admin/events/new")) return true
  if (isVenueMapWorkspace(pathname)) return true
  return false
}

export function isAccountFocusedFlow(pathname: string): boolean {
  return (
    /^\/cuenta\/entradas\/[^/]+$/.test(pathname) ||
    /^\/cuenta\/compras\/[^/]+$/.test(pathname)
  )
}

export function isPublicEventStorefrontPath(pathname: string): boolean {
  if (/^\/eventos\/[^/]+/.test(pathname)) return true
  if (/^\/events\/preview\//.test(pathname)) return true
  if (pathname === "/events" || pathname === "/eventos") return false
  return /^\/events\/[^/]+/.test(pathname)
}

export function isPublicFocusedFlow(pathname: string): boolean {
  if (isAccountFocusedFlow(pathname)) return true
  if (pathname.startsWith("/checkout")) return true
  if (/^\/event\/[^/]+\/queue\/?$/.test(pathname)) return true
  if (pathname.startsWith("/waiting-room")) return true
  if (/^\/tickets\/[^/]+\/print\/?$/.test(pathname)) return true
  return false
}
