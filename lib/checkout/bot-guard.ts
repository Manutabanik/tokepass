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

const recentCaptchaOk = new Map<string, { at: number; result: CaptchaVerification }>()
const CAPTCHA_OK_TTL_MS = 20_000

export async function verifyCheckoutCaptcha(input: {
  token?: string | null
  ip?: string | null
  skip?: boolean
}): Promise<CaptchaVerification> {
  const required = isCaptchaRequired()
  const skip = Boolean(input.skip) && !required
  const provider = getCaptchaProvider()
  const cachedToken = input.token?.trim() ?? ""
  if (cachedToken) {
    const hit = recentCaptchaOk.get(cachedToken)
    if (hit && Date.now() - hit.at < CAPTCHA_OK_TTL_MS) {
      return hit.result
    }
  }

  if (skip) {
    return { ok: true, provider: "none", score: null }
  }

  if (required && (provider === "none" || input.skip)) {
    logger.warn({
      context: "checkout/bot-guard",
      message: "captcha_required_missing_provider",
    })
    return {
      ok: false,
      provider,
      score: null,
      error: CHECKOUT_VERIFY_ERROR,
    }
  }

  if (provider === "none") {
    return { ok: true, provider: "none", score: null }
  }

  const token = input.token?.trim() ?? ""
  if (!token) {
    if (!required) {
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
    const result =
      provider === "recaptcha"
        ? await verifyRecaptcha(token, input.ip ?? null)
        : await verifyTurnstile(token, input.ip ?? null)
    if (result.ok && token) {
      recentCaptchaOk.set(token, { at: Date.now(), result })
    }
    return result
  } catch (error) {
    logger.error({
      context: "checkout/bot-guard",
      message: "captcha_verify_failed",
      error,
    })
    return {
      ok: false,
      provider,
      score: null,
      error: CHECKOUT_VERIFY_ERROR,
    }
  }
}
