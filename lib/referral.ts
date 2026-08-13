/**
 * Captura y persistencia del código de referido RRPP (?ref=).
 * Cookie + sessionStorage, ventana de atribución 30 días.
 */

export const REFERRAL_COOKIE_NAME = "tokepass_ref"
export const REFERRAL_STORAGE_KEY = "tokepass_ref"
/** 30 días en segundos. */
export const REFERRAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const REF_CODE_PATTERN = /^[A-Za-z0-9_-]{2,40}$/

export function normalizeReferralCode(
  value: string | null | undefined,
): string | null {
  const clean = value?.trim().toUpperCase() ?? ""
  if (!clean || !REF_CODE_PATTERN.test(clean)) return null
  return clean
}

export function buildReferralCookieOptions() {
  return {
    path: "/",
    maxAge: REFERRAL_MAX_AGE_SECONDS,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  }
}

/** Lee el código desde document.cookie (cliente). */
export function readReferralCookie(): string | null {
  if (typeof document === "undefined") return null
  const parts = document.cookie.split(";").map((part) => part.trim())
  for (const part of parts) {
    if (!part.startsWith(`${REFERRAL_COOKIE_NAME}=`)) continue
    return normalizeReferralCode(
      decodeURIComponent(part.slice(REFERRAL_COOKIE_NAME.length + 1)),
    )
  }
  return null
}

export function writeReferralCookie(code: string): void {
  if (typeof document === "undefined") return
  const normalized = normalizeReferralCode(code)
  if (!normalized) return
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : ""
  document.cookie = `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${REFERRAL_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}

export function writeReferralSession(code: string): void {
  if (typeof sessionStorage === "undefined") return
  const normalized = normalizeReferralCode(code)
  if (!normalized) return
  sessionStorage.setItem(REFERRAL_STORAGE_KEY, normalized)
}

export function readReferralSession(): string | null {
  if (typeof sessionStorage === "undefined") return null
  return normalizeReferralCode(sessionStorage.getItem(REFERRAL_STORAGE_KEY))
}

/** Prioridad: sessionStorage → cookie. */
export function getStoredReferralCode(): string | null {
  return readReferralSession() || readReferralCookie()
}

export function persistReferralCode(code: string): string | null {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return null
  writeReferralSession(normalized)
  writeReferralCookie(normalized)
  return normalized
}
