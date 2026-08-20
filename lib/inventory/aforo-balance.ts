import {
  asPositiveInt,
  computeEventCapacity,
  occupiesGeneralCapacity,
  type EventCapacityInput,
} from "@/lib/inventory/capacity-budget"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import type { EventFormValues } from "@/lib/validations/event-form"

export type AforoBalance = {
  physicalCapacity: number
  ticketStock: number
  difference: number
}

type TicketDraft = EventFormValues["tickets"][number]

export function computeAforoBalance(
  input: EventCapacityInput & { venueCapacity?: number | null },
): AforoBalance {
  const snapshot = computeEventCapacity(input)
  const mapped =
    snapshot.mapAllocatedCapacity + snapshot.generalSectorCapacity
  const fallback = asPositiveInt(
    input.customMaxCapacity ??
      input.baseVenueCapacity ??
      input.venueCapacity,
  )
  const physicalCapacity = mapped > 0 ? mapped : fallback
  const ticketStock = snapshot.generalAllocatedCapacity
  return {
    physicalCapacity,
    ticketStock,
    difference: physicalCapacity - ticketStock,
  }
}

export function findPrimaryGeneralIndex(
  tickets: readonly TicketDraft[],
): number {
  const occupying = tickets
    .map((tier, index) => ({ tier, index }))
    .filter(({ tier }) => occupiesGeneralCapacity(tier, tickets))
    .filter(({ tier }) => {
      const type = inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      })
      return type === "general"
    })

  if (occupying.length === 0) return -1

  const named = occupying.find(({ tier }) =>
    /general|campo|predio|entrada/i.test(tier.name ?? ""),
  )
  return (named ?? occupying[0]).index
}

export function assignRemainingToGeneral<T extends TicketDraft>(
  tickets: readonly T[],
  remaining: number,
): T[] {
  const extra = Math.max(0, Math.floor(Number(remaining) || 0))
  if (extra <= 0) return [...tickets]
  const index = findPrimaryGeneralIndex(tickets)
  if (index < 0) return [...tickets]
  return tickets.map((tier, current) => {
    if (current !== index) return tier
    return {
      ...tier,
      capacity: asPositiveInt(tier.capacity) + extra,
    }
  })
}

export function scaleTicketStockToLimit<T extends TicketDraft>(
  tickets: readonly T[],
  limit: number,
): T[] {
  const cap = Math.max(0, Math.floor(Number(limit) || 0))
  const weights = tickets.map((tier) =>
    occupiesGeneralCapacity(tier, tickets) ? asPositiveInt(tier.capacity) : 0,
  )
  const sum = weights.reduce((total, value) => total + value, 0)
  if (sum <= cap) return [...tickets]
  if (cap === 0) {
    return tickets.map((tier, index) =>
      weights[index] > 0 ? { ...tier, capacity: 0 } : tier,
    )
  }

  const scaled = weights.map((weight) =>
    weight > 0 ? Math.floor((weight * cap) / sum) : 0,
  )
  let leftover = cap - scaled.reduce((total, value) => total + value, 0)
  const order = weights
    .map((weight, index) => ({ weight, index }))
    .filter((row) => row.weight > 0)
    .sort((left, right) => right.weight - left.weight)

  for (const row of order) {
    if (leftover <= 0) break
    scaled[row.index] += 1
    leftover -= 1
  }

  return tickets.map((tier, index) =>
    weights[index] > 0 ? { ...tier, capacity: scaled[index] } : tier,
  )
}

export function ticketDisplayBadge(tier: {
  name?: string | null
  price?: number | null
  tierType?: TicketDraft["tierType"]
  layoutType?: TicketDraft["layoutType"]
  bundleItems?: TicketDraft["bundleItems"]
}): { label: string } {
  const type = inferInventoryTierType({
    tierType: tier.tierType,
    layoutType: tier.layoutType,
    bundleItems: tier.bundleItems,
  })
  const name = (tier.name ?? "").toLocaleLowerCase("es")
  if (type === "bundle") return { label: "Combo" }
  if (type === "addon") return { label: "Extra" }
  if (type === "seated") return { label: "Ubicación" }
  if (Number(tier.price) === 0 && tier.price != null) {
    return { label: "Cortesía" }
  }
  if (/\bvip\b/.test(name)) return { label: "VIP" }
  if (/(jubilad|mayor|senior)/i.test(name)) return { label: "Jubilados" }
  if (/(estudiante|universitar)/i.test(name)) return { label: "Estudiantes" }
  return { label: "General" }
}
