"use client"

const DEVICE_KEY = "tokepass.device.v1"
const DWELL_KEY = "tokepass.checkout.dwell.v1"

export function getOrCreateDeviceHash(): string {
  if (typeof window === "undefined") return "server"
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY)
    if (existing && /^[a-zA-Z0-9_-]{8,80}$/.test(existing)) return existing
    const next = crypto.randomUUID().replace(/-/g, "")
    window.localStorage.setItem(DEVICE_KEY, next)
    return next
  } catch {
    return "unknown"
  }
}

export function markCheckoutDwellStart(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(DWELL_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

export function getCheckoutDwellMs(): number {
  if (typeof window === "undefined") return 0
  try {
    const raw = window.sessionStorage.getItem(DWELL_KEY)
    const started = raw ? Number(raw) : NaN
    if (!Number.isFinite(started)) return 0
    return Math.max(0, Date.now() - started)
  } catch {
    return 0
  }
}

export function getPublicCaptchaSiteKey(): {
  provider: "recaptcha" | "turnstile" | "none"
  siteKey: string
} {
  const forced = process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER?.trim().toLowerCase()
  const recaptcha = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ?? ""
  const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? ""
  if (forced === "none") return { provider: "none", siteKey: "" }
  if (forced === "recaptcha" && recaptcha) {
    return { provider: "recaptcha", siteKey: recaptcha }
  }
  if (forced === "turnstile" && turnstile) {
    return { provider: "turnstile", siteKey: turnstile }
  }
  if (turnstile) return { provider: "turnstile", siteKey: turnstile }
  if (recaptcha) return { provider: "recaptcha", siteKey: recaptcha }
  return { provider: "none", siteKey: "" }
}

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
    turnstile?: {
      render: (
        target: HTMLElement,
        options: {
          sitekey: string
          size: "invisible"
          execution?: "render" | "execute"
          callback: (token: string) => void
          "error-callback"?: () => void
          "timeout-callback"?: () => void
        },
      ) => string
      execute: (widgetId: string) => void
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

function captchaApiReady(src: string): boolean {
  if (src.includes("turnstile")) return Boolean(window.turnstile)
  if (src.includes("recaptcha")) return Boolean(window.grecaptcha)
  return false
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (
        existing.getAttribute("data-loaded") === "1" ||
        captchaApiReady(src)
      ) {
        existing.setAttribute("data-loaded", "1")
        resolve()
        return
      }
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener(
        "error",
        () => reject(new Error("captcha_script")),
        { once: true },
      )
      return
    }
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.onload = () => {
      script.setAttribute("data-loaded", "1")
      resolve()
    }
    script.onerror = () => reject(new Error("captcha_script"))
    document.head.appendChild(script)
  })
}

let turnstileInflight: Promise<string | null> | null = null
let turnstileWidgetId: string | null = null
let turnstileHost: HTMLElement | null = null

function destroyTurnstileWidget() {
  const api = window.turnstile
  if (api && turnstileWidgetId) {
    try {
      api.remove(turnstileWidgetId)
    } catch {
      try {
        api.reset(turnstileWidgetId)
      } catch {
        // widget already gone
      }
    }
  }
  turnstileHost?.remove()
  turnstileWidgetId = null
  turnstileHost = null
}

async function requestTurnstileToken(siteKey: string): Promise<string | null> {
  await loadScript(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  )
  const turnstile = window.turnstile
  if (!turnstile) return null

  return new Promise((resolve) => {
    let settled = false
    const finish = (token: string | null) => {
      if (settled) return
      settled = true
      destroyTurnstileWidget()
      resolve(token)
    }

    turnstileHost = document.createElement("div")
    turnstileHost.setAttribute("aria-hidden", "true")
    turnstileHost.style.cssText =
      "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;"
    document.body.appendChild(turnstileHost)
    turnstileWidgetId = turnstile.render(turnstileHost, {
      sitekey: siteKey,
      size: "invisible",
      execution: "execute",
      callback: (token) => finish(token),
      "error-callback": () => finish(null),
      "timeout-callback": () => finish(null),
    })
    try {
      turnstile.execute(turnstileWidgetId)
    } catch {
      finish(null)
      return
    }
    window.setTimeout(() => finish(null), 8_000)
  })
}

export async function getCheckoutCaptchaToken(): Promise<string | null> {
  const { provider, siteKey } = getPublicCaptchaSiteKey()
  if (provider === "none" || !siteKey) return null

  if (provider === "recaptcha") {
    await loadScript(
      `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`,
    )
    const grecaptcha = window.grecaptcha
    if (!grecaptcha) return null
    return new Promise((resolve) => {
      grecaptcha.ready(() => {
        void grecaptcha
          .execute(siteKey, { action: "checkout" })
          .then(resolve)
          .catch(() => resolve(null))
      })
    })
  }

  if (turnstileInflight) return turnstileInflight
  turnstileInflight = requestTurnstileToken(siteKey).finally(() => {
    turnstileInflight = null
  })
  return turnstileInflight
}
