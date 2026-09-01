/** Huella de dispositivo para Living QR. El totp_secret solo sale al device activo. */

export const WALLET_DEVICE_COOKIE = "tokepass.wallet.device_id"
export const WALLET_DEVICE_STORAGE_KEY = "tokepass.wallet.device_id"
export const WALLET_DEVICE_FORM_FIELD = "device_id"
export const WALLET_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400

export const WALLET_DEVICE_MISMATCH_MESSAGE =
  "Sesión iniciada en otro dispositivo"
export const WALLET_DEVICE_MISMATCH_CODE = "wallet_device_mismatch"

const WALLET_DEVICE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class WalletDeviceMismatchError extends Error {
  readonly code = WALLET_DEVICE_MISMATCH_CODE

  constructor(message = WALLET_DEVICE_MISMATCH_MESSAGE) {
    super(message)
    this.name = "WalletDeviceMismatchError"
  }
}

export function isWalletDeviceId(value: string): boolean {
  return WALLET_DEVICE_ID_RE.test(value)
}

export function normalizeWalletDeviceId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (!isWalletDeviceId(normalized)) return null
  return normalized
}

export function createWalletDeviceId(): string {
  return crypto.randomUUID()
}

/**
 * Cookie y body tienen que coincidir si ambos existen.
 * Si no, un JWT clonado podría mandar el active_device_id leído del perfil.
 */
export function resolveIncomingWalletDeviceId(
  submitted: unknown,
  cookieValue: unknown,
): string | null {
  const fromSubmit = normalizeWalletDeviceId(submitted)
  const fromCookie = normalizeWalletDeviceId(cookieValue)
  if (fromSubmit && fromCookie && fromSubmit !== fromCookie) return null
  return fromCookie ?? fromSubmit
}

export function isWalletDeviceMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === "WalletDeviceMismatchError") return true
  if (error.message === WALLET_DEVICE_MISMATCH_MESSAGE) return true
  if (error.message === WALLET_DEVICE_MISMATCH_CODE) return true
  return false
}

export function walletDeviceCookieOptions(): {
  path: string
  maxAge: number
  sameSite: "lax"
  secure: boolean
  httpOnly: false
} {
  return {
    path: "/",
    maxAge: WALLET_DEVICE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL === "1" ||
      process.env.VERCEL_ENV === "production",
    httpOnly: false,
  }
}

function readWalletDeviceIdFromDocumentCookie(): string | null {
  if (typeof document === "undefined") return null
  const prefix = `${WALLET_DEVICE_COOKIE}=`
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(prefix)) continue
    return normalizeWalletDeviceId(
      decodeURIComponent(trimmed.slice(prefix.length)),
    )
  }
  return null
}

export function persistWalletDeviceId(id: string): void {
  const normalized = normalizeWalletDeviceId(id)
  if (!normalized || typeof window === "undefined") return
  try {
    window.localStorage.setItem(WALLET_DEVICE_STORAGE_KEY, normalized)
  } catch {
    // Safari privado / storage lleno: la cookie sigue siendo la fuente SSR.
  }
  const attrs = walletDeviceCookieOptions()
  const secure = attrs.secure || window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${WALLET_DEVICE_COOKIE}=${normalized}; Path=${attrs.path}; Max-Age=${attrs.maxAge}; SameSite=Lax${secure}`
}

/** Cookie primero: después del login el server ya escribió el id reclamado. */
export function readOrCreateWalletDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("wallet_device_id_client_only")
  }
  let fromStorage: string | null = null
  try {
    fromStorage = normalizeWalletDeviceId(
      window.localStorage.getItem(WALLET_DEVICE_STORAGE_KEY),
    )
  } catch {
    fromStorage = null
  }
  const fromCookie = readWalletDeviceIdFromDocumentCookie()
  const winner = fromCookie ?? fromStorage ?? createWalletDeviceId()
  persistWalletDeviceId(winner)
  return winner
}
