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

export const STAFF_ROUTE_ALLOWLIST = [
  "/admin/scanner",
  "/admin/bar-scanner",
  "/admin/pos",
] as const

export type StaffRoute = (typeof STAFF_ROUTE_ALLOWLIST)[number]

export function isStaffOpsPath(pathname: string): boolean {
  return STAFF_ROUTE_ALLOWLIST.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
}

export function staffHomeForRoles(roles: EventStaffRole[]): string {
  if (roles.includes("door_staff")) return "/admin/scanner"
  if (roles.includes("bar_staff")) return "/admin/bar-scanner"
  if (roles.includes("cashier")) return "/admin/pos"
  return "/admin/scanner"
}

export function navAllowedForStaffRoles(roles: EventStaffRole[]): string[] {
  const hrefs: string[] = []
  if (roles.includes("door_staff")) hrefs.push("/admin/scanner")
  if (roles.includes("bar_staff")) hrefs.push("/admin/bar-scanner")
  if (roles.includes("cashier")) hrefs.push("/admin/pos")
  return hrefs
}
