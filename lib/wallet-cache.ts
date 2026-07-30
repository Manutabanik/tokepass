/**
 * Helpers PWA: cache preventivo de assets de entradas via Service Worker.
 */

export function requestTicketAssetCache(urls: Array<string | null | undefined>) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

  const clean = [
    ...new Set(
      urls
        .filter((url): url is string => Boolean(url && url.trim()))
        .map((url) => url.trim()),
    ),
  ]

  if (clean.length === 0) return

  void navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({
        type: "CACHE_TICKET_ASSETS",
        urls: clean,
      })
    })
    .catch(() => {})
}

export function isAppleWalletConfigured(): boolean {
  return Boolean(
    process.env.APPLE_PASS_TYPE_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_PASS_SIGNER_CERT &&
      process.env.APPLE_PASS_SIGNER_KEY,
  )
}

export function isGoogleWalletConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_WALLET_ISSUER_ID &&
      process.env.GOOGLE_WALLET_CLASS_ID &&
      process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL,
  )
}

/** Server-only: public flag AND real credentials. Never show broken wallet CTAs. */
export function getWalletUiFlags() {
  return {
    appleWalletEnabled:
      process.env.NEXT_PUBLIC_APPLE_WALLET_ENABLED === "true" &&
      isAppleWalletConfigured(),
    googleWalletEnabled:
      process.env.NEXT_PUBLIC_GOOGLE_WALLET_ENABLED === "true" &&
      isGoogleWalletConfigured(),
  }
}
