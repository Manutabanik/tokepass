import "server-only"

import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { SignJWT, jwtVerify } from "jose"

const MAGIC_TTL = "7d"
const OTP_TTL_MS = 15 * 60 * 1000

export const GUEST_OTP_ERROR = "El código no coincide. Probá de nuevo."
export const GUEST_OTP_LOCKED_ERROR = "Pedí un código nuevo para continuar."
export const GUEST_ACCESS_ERROR =
  "El enlace de acceso expiró. Pedí uno nuevo desde el mail de confirmación."

export const GUEST_ORDER_COOKIE = "tp_guest_order"
export const GUEST_OTP_COOKIE = "tp_guest_otp"

export function guestAccessCookieAttrs() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  }
}

function getSecretKey(): Uint8Array {
  const raw =
    process.env.GUEST_TICKET_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "tokepass-guest-dev-secret"
  return new TextEncoder().encode(raw)
}

export function hashGuestSecret(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex")
}

export function generateGuestOtp(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0")
}

export function otpEquals(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function signGuestAccessToken(input: {
  orderId: string
  email: string
  jti: string
}): Promise<string> {
  return new SignJWT({
    email: input.email,
    purpose: "guest-ticket-access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.orderId)
    .setJti(input.jti)
    .setIssuedAt()
    .setExpirationTime(MAGIC_TTL)
    .sign(getSecretKey())
}

export async function verifyGuestAccessToken(token: string): Promise<{
  orderId: string
  email: string
  jti: string
} | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    })
    if (payload.purpose !== "guest-ticket-access") return null
    const orderId = typeof payload.sub === "string" ? payload.sub : ""
    const email = typeof payload.email === "string" ? payload.email : ""
    const jti = typeof payload.jti === "string" ? payload.jti : ""
    if (!orderId || !email || !jti) return null
    return { orderId, email, jti }
  } catch {
    return null
  }
}

export async function signGuestOtpSession(orderId: string): Promise<string> {
  return new SignJWT({ purpose: "guest-otp-ok" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(orderId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey())
}

export async function verifyGuestOtpSession(
  token: string,
  orderId: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    })
    return payload.purpose === "guest-otp-ok" && payload.sub === orderId
  } catch {
    return false
  }
}

export function guestOtpExpiresAt(now = Date.now()): string {
  return new Date(now + OTP_TTL_MS).toISOString()
}
