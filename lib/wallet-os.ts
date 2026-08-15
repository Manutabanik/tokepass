export type WalletSaveTarget = "apple" | "google" | "pdf"

export function detectWalletSaveTarget(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  maxTouchPoints = typeof navigator === "undefined"
    ? 0
    : navigator.maxTouchPoints,
): WalletSaveTarget {
  const ua = userAgent
  const iPhone = /iPhone|iPad|iPod/i.test(ua)
  const iPadOs = /Macintosh/i.test(ua) && maxTouchPoints > 1
  if (iPhone || iPadOs) return "apple"
  if (/Android/i.test(ua)) return "google"
  return "pdf"
}

export function resolveWalletSaveTarget(input: {
  appleWalletEnabled: boolean
  googleWalletEnabled: boolean
  userAgent?: string
  maxTouchPoints?: number
}): WalletSaveTarget {
  const os = detectWalletSaveTarget(input.userAgent, input.maxTouchPoints)
  if (os === "apple" && input.appleWalletEnabled) return "apple"
  if (os === "google" && input.googleWalletEnabled) return "google"
  return "pdf"
}
