export const RATE_LIMITS = {
  checkoutIp: { limit: 8, windowSeconds: 60 },
  checkoutUser: { limit: 8, windowSeconds: 10 * 60 },
  cartHoldUser: { limit: 20, windowSeconds: 60 },
  /** Burst por IP para holdSeat / lockTickets / reservas de mapa. */
  cartHoldIp: { limit: 40, windowSeconds: 60 },
  paymentPreferenceUser: { limit: 5, windowSeconds: 60 },
  authIp: { limit: 10, windowSeconds: 60 },
  publicStockIp: { limit: 30, windowSeconds: 60 },
  /** POST de Server Actions en checkout + /api/scanner/scan (Edge). */
  checkoutEdgeIp: { limit: 80, windowSeconds: 60 },
  /** Fuerza bruta de cupones: pocos intentos por IP. */
  promoValidateIp: { limit: 8, windowSeconds: 60 },
  promoValidateUser: { limit: 12, windowSeconds: 60 },
} as const

export const RATE_LIMIT_BUSY_ERROR =
  "Estamos procesando muchas solicitudes. Esperá un minuto e intentá de nuevo."

export const AUTH_RATE_LIMIT_ERROR =
  "Demasiados intentos. Esperá un minuto e intentá de nuevo."

export const PROMO_RATE_LIMIT_ERROR =
  "Demasiados intentos de cupón. Esperá un minuto e intentá de nuevo."
