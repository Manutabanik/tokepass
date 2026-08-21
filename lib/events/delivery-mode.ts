export const EVENT_DELIVERY_MODES = ["PRESENCIAL", "ONLINE"] as const

export type EventDeliveryMode = (typeof EVENT_DELIVERY_MODES)[number]

export function parseDeliveryMode(value: unknown): EventDeliveryMode {
  return value === "ONLINE" ? "ONLINE" : "PRESENCIAL"
}

export function isOnlineDelivery(value: unknown): boolean {
  return parseDeliveryMode(value) === "ONLINE"
}

export function normalizeAccessLink(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

export function eventAccessTimeLabel(mode: unknown): string {
  return isOnlineDelivery(mode) ? "Inicio de transmisión" : "Puertas"
}
