import "server-only"

import { logger } from "@/lib/logger"

const RECAPTCHA_MIN_SCORE = 0.7

export const CHECKOUT_VERIFY_ERROR =
  "No pudimos validar la compra. Recargá la página e intentá de nuevo."
export const CHECKOUT_BUSY_ERROR =
  "Estamos procesando muchas compras. Esperá un minuto e intentá de nuevo."
export const CHECKOUT_TICKET_CAP_ERROR =
  "Alcanzaste el máximo de entradas para este evento."

export type CaptchaProvider = "recaptcha" | "turnstile" | "none"

export type CaptchaVerification =
  | {
      ok: true
      provider: CaptchaProvider
      score: number | null
    }
  | {
      ok: false
      provider: CaptchaProvider
      score: number | null
      error: string
    }

function recaptchaSecret(): string {
  return (
    process.env.RECAPTCHA_SECRET_KEY?.trim() ||
    process.env.RECAPTCHA_SECRET?.trim() ||
    ""
  )
}

function turnstileSecret(): string {
  return (
    process.env.TURNSTILE_SECRET_KEY?.trim() ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim() ||
    ""
  )
}

export function getCaptchaProvider(): CaptchaProvider {
  const forced = process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER?.trim().toLowerCase()
  if (forced === "recaptcha" || forced === "turnstile" || forced === "none") {
    return forced
  }
  if (turnstileSecret()) return "turnstile"
  if (recaptchaSecret()) return "recaptcha"
  return "none"
}

export function isCaptchaRequired(): boolean {
  if (getCaptchaProvider() === "none") return false
  return process.env.NODE_ENV === "production"
}

async function verifyRecaptcha(
  token: string,
  ip: string | null,
): Promise<CaptchaVerification> {
  const secret = recaptchaSecret()
  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set("remoteip", ip)

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const payload = (await response.json()) as {
    success?: boolean
    score?: number
    action?: string
  }
  const score = typeof payload.score === "number" ? payload.score : null
  if (!payload.success || score == null || score < RECAPTCHA_MIN_SCORE) {
    logger.warn({
      context: "checkout/bot-guard",
      message: "recaptcha_rejected",
      score,
    })
    return { ok: false, provider: "recaptcha", score, error: CHECKOUT_VERIFY_ERROR }
  }
  return { ok: true, provider: "recaptcha", score }
}

async function verifyTurnstile(
  token: string,
  ip: string | null,
): Promise<CaptchaVerification> {
  const secret = turnstileSecret()
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    },
  )
  const payload = (await response.json()) as { success?: boolean }
  if (!payload.success) {
    logger.warn({
      context: "checkout/bot-guard",
      message: "turnstile_rejected",
    })
    return {
      ok: false,
      provider: "turnstile",
      score: null,
      error: CHECKOUT_VERIFY_ERROR,
    }
  }
  return { ok: true, provider: "turnstile", score: 1 }
}

export async function verifyCheckoutCaptcha(input: {
  token?: string | null
  ip?: string | null
  skip?: boolean
}): Promise<CaptchaVerification> {
  const provider = getCaptchaProvider()
  if (input.skip || provider === "none") {
    return { ok: true, provider: "none", score: null }
  }

  const token = input.token?.trim() ?? ""
  if (!token) {
    if (!isCaptchaRequired()) {
      return { ok: true, provider: "none", score: null }
    }
    return {
      ok: false,
      provider,
      score: null,
      error: CHECKOUT_VERIFY_ERROR,
    }
  }

  try {
    if (provider === "recaptcha") {
      return await verifyRecaptcha(token, input.ip ?? null)
    }
    return await verifyTurnstile(token, input.ip ?? null)
  } catch (error) {
    logger.error({
      context: "checkout/bot-guard",
      message: "captcha_verify_failed",
      error,
    })
    if (!isCaptchaRequired()) {
      return { ok: true, provider: "none", score: null }
    }
    return {
      ok: false,
      provider,
      score: null,
      error: CHECKOUT_VERIFY_ERROR,
    }
  }
}
