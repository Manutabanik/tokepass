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
          callback: (token: string) => void
        },
      ) => string
      execute: (widgetId: string) => void
      reset: (widgetId: string) => void
    }
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("captcha_script"))
    document.head.appendChild(script)
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

  await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit")
  const turnstile = window.turnstile
  if (!turnstile) return null

  return new Promise((resolve) => {
    const host = document.createElement("div")
    host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;"
    document.body.appendChild(host)
    const widgetId = turnstile.render(host, {
      sitekey: siteKey,
      size: "invisible",
      callback: (token) => {
        host.remove()
        resolve(token)
      },
    })
    turnstile.execute(widgetId)
    window.setTimeout(() => {
      host.remove()
      resolve(null)
    }, 8_000)
  })
}
