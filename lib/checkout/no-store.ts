/** Session, cart, coupons and fulfillment must never be CDN-cached. */
export const FETCH_NO_STORE = { cache: "no-store" as const }

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const
