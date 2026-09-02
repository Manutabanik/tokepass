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

export function organizerLoginUrlWithNext(nextPath: string): string {
  const safe = safeInternalNextPath(nextPath) ?? "/admin"
  return `/login-organizador?next=${encodeURIComponent(safe)}`
}

/**
 * Los layouts de servidor no reciben la ruta actual, así que el interceptor Edge
 * la propaga en este header. Sin él, un guard de layout sólo puede mandar al
 * login sin `next` y pierde la intención del usuario.
 */
export const REQUEST_PATHNAME_HEADER = "x-pathname"

export function postLoginDestination(
  role: UserRole | null | undefined,
): "/superadmin" | "/admin" | "/cuenta" {
  if (role === "super_admin") return "/superadmin"
  if (role === "admin") return "/admin"
  return "/cuenta"
}

/**
 * Pantallas que no tienen sentido con sesión activa.
 *
 * `/register-organizador` queda deliberadamente afuera: es donde un cliente ya
 * logueado postula su productora, y es el destino al que el layout de admin manda
 * a los organizadores rechazados o suspendidos. Bloquearla rompería el embudo de
 * alta y crearía un bucle con ese layout.
 */
const AUTH_ENTRY_ROUTES = new Set(["/login", "/login-organizador", "/register"])

export function isAuthEntryRoute(pathname: string): boolean {
  return AUTH_ENTRY_ROUTES.has(pathname)
}

/**
 * Dónde mandar a alguien que ya tiene sesión y pide una pantalla de login.
 * Honra `next` salvo que apunte a otra pantalla de auth, que sería un bucle.
 */
export function authenticatedVisitorDestination(
  next: unknown,
  role: UserRole | null | undefined,
): string {
  const safe = safeInternalNextPath(next)
  if (safe && !isAuthEntryRoute(safe.split("?")[0] ?? "")) return safe
  return postLoginDestination(role)
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
