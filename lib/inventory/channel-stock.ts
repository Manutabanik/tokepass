/** Cupo digital (web/POS/cortesía) vs cupo de papel (`batch_print`). */

export const DIGITAL_STOCK_CHANNELS = [
  "online",
  "pos",
  "complimentary",
] as const

export const PHYSICAL_STOCK_CHANNELS = ["batch_print"] as const

export const WEB_SALE_CHANNELS = ["online", "pos"] as const

export type DashboardIssuanceBucket = "web" | "paper" | "other"

function asInt(value: unknown): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

export function normalizeStockChannel(
  channel: string | null | undefined,
): string {
  const value = (channel ?? "online").trim().toLowerCase()
  return value || "online"
}

export function issuanceUsesDigitalStock(
  channel: string | null | undefined,
): boolean {
  return (DIGITAL_STOCK_CHANNELS as readonly string[]).includes(
    normalizeStockChannel(channel),
  )
}

export function issuanceUsesPhysicalStock(
  channel: string | null | undefined,
): boolean {
  return normalizeStockChannel(channel) === "batch_print"
}

export function classifyIssuanceForDashboard(
  channel: string | null | undefined,
): DashboardIssuanceBucket {
  const value = normalizeStockChannel(channel)
  if (value === "batch_print") return "paper"
  if ((WEB_SALE_CHANNELS as readonly string[]).includes(value)) return "web"
  return "other"
}

export function digitalRemaining(input: {
  capacity?: number | null
  digitalCapacity?: number | null
  digital_capacity?: number | null
  sold?: number | null
}): number {
  const cap = asInt(
    input.digitalCapacity ?? input.digital_capacity ?? input.capacity,
  )
  return Math.max(0, cap - asInt(input.sold))
}

export function physicalRemaining(input: {
  physicalCapacity?: number | null
  physical_capacity?: number | null
  physicalIssued?: number | null
  physical_issued?: number | null
}): number {
  const cap = asInt(input.physicalCapacity ?? input.physical_capacity)
  const issued = asInt(input.physicalIssued ?? input.physical_issued)
  return Math.max(0, cap - issued)
}
