import { collectLiveSeatingSectorIds } from "@/lib/events/sanitize-ticket-tiers"
import {
  eventHasActiveSeatingMap,
  resolveActiveSeatingMapFlags,
} from "@/lib/inventory/map-enablement"
import {
  applyMapCapacityToTickets,
  consolidateEventTicketsForPersist,
  isMapBackedTicket,
  mapTicketSyncKey,
} from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"
import { parseVenueMap } from "@/types/venue-map"

function detachTicketsFromSeatingPlan(
  tickets: EventFormValues["tickets"],
): EventFormValues["tickets"] {
  return tickets.map((tier) => {
    const detachLayout =
      tier.layoutType === "numbered_seat" || tier.layoutType === "table_combo"
    const detachSeated =
      detachLayout ||
      Boolean(tier.seatingSectorId?.trim()) ||
      tier.tierType === "seated"
    return {
      ...tier,
      seatingSectorId: null,
      layoutType: detachLayout ? ("general" as const) : tier.layoutType,
      tierType:
        tier.tierType === "bundle" || tier.tierType === "addon"
          ? tier.tierType
          : detachSeated
            ? ("general" as const)
            : tier.tierType,
      capacityPerUnit: 1,
    }
  })
}

function dedupeMapBackedTickets(
  tickets: EventFormValues["tickets"],
): EventFormValues["tickets"] {
  const seen = new Set<string>()
  const next: EventFormValues["tickets"] = []
  for (const tier of tickets) {
    if (!isMapBackedTicket(tier)) {
      next.push(tier)
      continue
    }
    const key = mapTicketSyncKey(tier)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(tier)
  }
  return next
}

/**
 * Normaliza flags de mapa, elimina tickets map-backed huérfanos/duplicados
 * y re-sincroniza stock/precio desde el plano antes de persistir.
 */
export function healEventFormInventory<T extends EventFormValues>(data: T): T {
  const seatingFlags = resolveActiveSeatingMapFlags({
    hasSeatingPlan: data.basics.hasSeatingPlan,
    includesSeatingMap: data.venue.includesSeatingMap,
    venueMap: data.venue.venueMap,
  })

  const normalized = {
    ...data,
    basics: {
      ...data.basics,
      hasSeatingPlan: seatingFlags.hasSeatingPlan,
    },
    venue: {
      ...data.venue,
      includesSeatingMap: seatingFlags.includesSeatingMap,
    },
  } as T

  const mapActive = eventHasActiveSeatingMap({
    hasSeatingPlan: seatingFlags.hasSeatingPlan,
    includesSeatingMap: seatingFlags.includesSeatingMap,
    venueMap: normalized.venue.venueMap,
  })

  if (!mapActive) {
    const tickets = detachTicketsFromSeatingPlan(normalized.tickets ?? [])
    return { ...normalized, tickets }
  }

  const map = parseVenueMap(normalized.venue.venueMap)
  const liveSectorIds = collectLiveSeatingSectorIds({
    venueMap: map,
    seatingLayout: normalized.venue.seatingLayout,
  })

  const reconciledTickets = (normalized.tickets ?? []).flatMap((tier) => {
    if (!isMapBackedTicket(tier)) return [tier]
    const sectorId = tier.seatingSectorId?.trim()
    if (!sectorId || !liveSectorIds.has(sectorId)) {
      return detachTicketsFromSeatingPlan([tier])
    }
    return [tier]
  })

  const consolidated = consolidateEventTicketsForPersist({
    ...normalized,
    tickets: reconciledTickets,
  })
  const tickets = dedupeMapBackedTickets(
    applyMapCapacityToTickets(consolidated, map),
  )

  return { ...normalized, tickets }
}
