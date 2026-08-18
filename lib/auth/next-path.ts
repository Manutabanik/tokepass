import type { UserRole } from "@/types/database"

/** Only same-origin relative paths (open-redirect safe). */
export function safeInternalNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const path = raw.trim()
  if (!path.startsWith("/") || path.startsWith("//")) return null
  if (path.includes("://") || path.includes("\\")) return null
  return path
}

export function loginUrlWithNext(nextPath: string): string {
  const safe = safeInternalNextPath(nextPath) ?? "/cuenta"
  return `/login?next=${encodeURIComponent(safe)}`
}

export function postLoginDestination(
  role: UserRole | null | undefined,
): "/superadmin" | "/admin" | "/cuenta" {
  if (role === "super_admin") return "/superadmin"
  if (role === "admin") return "/admin"
  return "/cuenta"
}

/** Buyer default is home; honor `next` (checkout, cuenta, evento). */
export function resolveAuthCallbackDestination(
  next: unknown,
  role?: UserRole | null,
): string {
  const safe = safeInternalNextPath(next)
  if (safe) return safe
  if (role === "super_admin") return "/superadmin"
  if (role === "admin") return "/admin"
  return "/"
}
