/**
 * Helpers client-side para Meta Pixel, TikTok Pixel y GA4.
 * Los scripts se inyectan vía <AnalyticsTracker />; este módulo solo dispara eventos.
 */

export type EventPixelConfig = {
  metaPixelId: string | null
  metaPixelEnabled: boolean
  tiktokPixelId: string | null
  tiktokPixelEnabled: boolean
  ga4MeasurementId: string | null
  ga4Enabled: boolean
}

export type PixelCommercePayload = {
  contentName?: string
  contentIds?: string[]
  value?: number
  currency?: string
  numItems?: number
  transactionId?: string
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
    ttq?: {
      load: (id: string) => void
      page: () => void
      track: (event: string, payload?: Record<string, unknown>) => void
    }
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function emptyPixelConfig(): EventPixelConfig {
  return {
    metaPixelId: null,
    metaPixelEnabled: false,
    tiktokPixelId: null,
    tiktokPixelEnabled: false,
    ga4MeasurementId: null,
    ga4Enabled: false,
  }
}

export function hasActivePixels(config: EventPixelConfig | null | undefined): boolean {
  if (!config) return false
  return (
    (config.metaPixelEnabled && Boolean(config.metaPixelId?.trim())) ||
    (config.tiktokPixelEnabled && Boolean(config.tiktokPixelId?.trim())) ||
    (config.ga4Enabled && Boolean(config.ga4MeasurementId?.trim()))
  )
}

function commerceParams(payload: PixelCommercePayload): Record<string, unknown> {
  const params: Record<string, unknown> = {
    content_type: "product",
  }
  if (payload.contentName) params.content_name = payload.contentName
  if (payload.contentIds?.length) params.content_ids = payload.contentIds
  if (payload.value != null && Number.isFinite(payload.value)) {
    params.value = Math.round(payload.value * 100) / 100
  }
  if (payload.currency) params.currency = payload.currency
  if (payload.numItems != null) params.num_items = payload.numItems
  if (payload.transactionId) params.transaction_id = payload.transactionId
  return params
}

function fireMeta(eventName: string, payload: PixelCommercePayload) {
  try {
    if (typeof window === "undefined" || typeof window.fbq !== "function") return
    window.fbq("track", eventName, commerceParams(payload))
  } catch {
    return
  }
}

function fireTikTok(eventName: string, payload: PixelCommercePayload) {
  try {
    if (typeof window === "undefined" || !window.ttq?.track) return
    const params = commerceParams(payload)
    window.ttq.track(eventName, {
      contents: (payload.contentIds ?? []).map((id) => ({
        content_id: id,
        content_type: "product",
        content_name: payload.contentName,
      })),
      value: params.value,
      currency: params.currency ?? "ARS",
      quantity: payload.numItems,
    })
  } catch {
    return
  }
}

function fireGa4(eventName: string, payload: PixelCommercePayload) {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return
    window.gtag("event", eventName, {
      currency: payload.currency ?? "ARS",
      value: payload.value,
      transaction_id: payload.transactionId,
      items: (payload.contentIds ?? []).map((id) => ({
        item_id: id,
        item_name: payload.contentName,
        quantity: 1,
      })),
    })
  } catch {
    return
  }
}

/** Vista de ficha de evento. */
export function trackViewContent(payload: PixelCommercePayload) {
  fireMeta("ViewContent", payload)
  fireTikTok("ViewContent", payload)
  fireGa4("view_item", payload)
}

/** Selección de entradas / carrito. */
export function trackAddToCart(payload: PixelCommercePayload) {
  fireMeta("AddToCart", payload)
  fireTikTok("AddToCart", payload)
  fireGa4("add_to_cart", payload)
}

/** Inicio de checkout / redirección a pago. */
export function trackInitiateCheckout(payload: PixelCommercePayload) {
  fireMeta("InitiateCheckout", payload)
  fireTikTok("InitiateCheckout", payload)
  fireGa4("begin_checkout", payload)
}

/** Compra confirmada / pago exitoso. */
export function trackPurchase(payload: PixelCommercePayload) {
  fireMeta("Purchase", { ...payload, currency: payload.currency ?? "ARS" })
  fireTikTok("CompletePayment", {
    ...payload,
    currency: payload.currency ?? "ARS",
  })
  fireGa4("purchase", { ...payload, currency: payload.currency ?? "ARS" })
}
