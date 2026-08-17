/**
 * Auth / staff capability types for Tokepass ops roles.
 * Global profiles.role stays customer|admin|super_admin.
 * Per-event capabilities live in event_staff_assignments.
 */

export const EVENT_STAFF_ROLES = [
  "door_staff",
  "bar_staff",
  "cashier",
] as const

export type EventStaffRole = (typeof EVENT_STAFF_ROLES)[number]

export const DOOR_STAFF_ROUTES = [
  "/admin/scanner",
  "/admin/validator",
] as const

export const BAR_STAFF_ROUTES = [
  "/admin/bar-scanner",
  "/admin/store-scanner",
] as const

export const CASHIER_POS_ROUTES = ["/admin/pos", "/dashboard/pos"] as const

export const STAFF_ROUTE_ALLOWLIST = [
  ...DOOR_STAFF_ROUTES,
  ...BAR_STAFF_ROUTES,
  ...CASHIER_POS_ROUTES,
] as const

export type StaffRoute = (typeof STAFF_ROUTE_ALLOWLIST)[number]

function pathMatches(
  pathname: string,
  routes: readonly string[],
): boolean {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
}

export function isStaffOpsPath(pathname: string): boolean {
  return pathMatches(pathname, STAFF_ROUTE_ALLOWLIST)
}

export function isPosOpsPath(pathname: string): boolean {
  return pathMatches(pathname, CASHIER_POS_ROUTES)
}

export function staffCanAccessPath(
  pathname: string,
  roles: readonly string[],
): boolean {
  const set = new Set(roles.map((role) => String(role).trim()))
  if (set.has("door_staff") && pathMatches(pathname, DOOR_STAFF_ROUTES)) {
    return true
  }
  if (set.has("bar_staff") && pathMatches(pathname, BAR_STAFF_ROUTES)) {
    return true
  }
  if (
    (set.has("cashier") || set.has("box_office_cashier")) &&
    pathMatches(pathname, CASHIER_POS_ROUTES)
  ) {
    return true
  }
  return false
}

export function staffHomeForRoles(roles: EventStaffRole[]): string {
  if (roles.includes("door_staff")) return "/admin/scanner"
  if (roles.includes("bar_staff")) return "/admin/store-scanner"
  if (roles.includes("cashier")) return "/dashboard/pos"
  return "/admin/scanner"
}

export function navAllowedForStaffRoles(roles: EventStaffRole[]): string[] {
  const hrefs: string[] = []
  if (roles.includes("door_staff")) {
    hrefs.push("/admin/scanner")
    hrefs.push("/admin/validator")
  }
  if (roles.includes("bar_staff")) hrefs.push("/admin/store-scanner")
  if (roles.includes("cashier")) hrefs.push("/dashboard/pos")
  return hrefs
}
