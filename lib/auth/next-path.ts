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

/** Billetera del dispositivo: lee IndexedDB y no necesita sesión Supabase. */
export const DEVICE_WALLET_PATH = "/offline/billetera"
/** Marca por qué se cayó a la billetera local, para ofrecer el login correcto. */
export const DEVICE_WALLET_REASON_PARAM = "sesion"
export const DEVICE_WALLET_REASON_EXPIRED = "expirada"

/** Ruta de la billetera a la que vuelve el usuario después de loguearse. */
export const WALLET_PATH = "/cuenta/entradas"

/**
 * Sin sesión, la billetera cae a la copia local del dispositivo en vez del
 * login: la entrada ya está en IndexedDB y un login es inútil en la puerta de
 * un evento con la red saturada.
 *
 * Aplica solo a la raíz. `/cuenta/entradas/acceso` y `/cuenta/entradas/<id>`
 * tienen su propio acceso de invitado por token y resuelven el caso sin sesión
 * por su cuenta; capturarlos acá rompería esos flujos.
 */
export function isDeviceWalletFallbackPath(pathname: string): boolean {
  return pathname === WALLET_PATH || pathname === `${WALLET_PATH}/`
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
