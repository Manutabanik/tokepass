import { normalizeDayId, normalizeScheduleDaysFromForm } from "@/lib/event-schedule"
import {
  collectLiveSeatingSectorIds,
  collectSeatingLayoutSectorIds,
  sanitizeEventSubmitPayload,
  type SanitizeTicketTiersOptions,
} from "@/lib/events/sanitize-ticket-tiers"
import { healEventFormInventory } from "@/lib/inventory/heal-event-form-inventory"
import { resolveVenueSeatingArtifactsForPersist } from "@/lib/inventory/venue-seating-persist"
import { ticketFamilyNameKey, ticketSoldCount } from "@/lib/inventory/synced-day-tickets"
import type { EventFormValues } from "@/lib/validations/event-form"

/** Quita entradas huérfanas sin jornada cuando ya existen filas por día. */
function collapseMultiDayOrphanTickets(
  tickets: EventFormValues["tickets"],
  isMultiDay: boolean,
  scheduleDayIds: readonly string[],
): EventFormValues["tickets"] {
  if (!isMultiDay || scheduleDayIds.length < 2) return tickets

  const perDayFamilyNames = new Set<string>()
  for (const tier of tickets) {
    const dayId = normalizeDayId(tier.dayId)
    if (!dayId || !scheduleDayIds.includes(dayId)) continue
    if (tier.tierType === "addon" || tier.tierType === "bundle") continue
    perDayFamilyNames.add(ticketFamilyNameKey(tier.name))
  }
  if (perDayFamilyNames.size === 0) return tickets

  return tickets.filter((tier) => {
    if (normalizeDayId(tier.dayId)) return true
    if (tier.tierType === "addon" || tier.tierType === "bundle") return true
    if (tier.bundleType === "multi_day_pass") return true
    const nameKey = ticketFamilyNameKey(tier.name)
    if (!perDayFamilyNames.has(nameKey)) return true
    return ticketSoldCount(tier) > 0
  })
}

function dedupeTicketsForPersist(
  tickets: EventFormValues["tickets"],
): EventFormValues["tickets"] {
  const byKey = new Map<string, EventFormValues["tickets"][number]>()
  for (const tier of tickets) {
    const key = tier.id
      ? `id:${tier.id}`
      : `row:${ticketFamilyNameKey(tier.name)}::${normalizeDayId(tier.dayId) ?? ""}::${tier.seatingSectorId ?? ""}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, tier)
      continue
    }
    if (ticketSoldCount(tier) > ticketSoldCount(existing)) {
      byKey.set(key, tier)
      continue
    }
    if (tier.id && !existing.id) {
      byKey.set(key, tier)
    }
  }
  return [...byKey.values()]
}

function coerceTicketsToLayoutSectors(
  tickets: EventFormValues["tickets"],
  layoutSectorIds: Set<string>,
): EventFormValues["tickets"] {
  return tickets.map((tier) => {
    const sectorId = tier.seatingSectorId?.trim() || null
    if (!sectorId) {
      if (
        tier.layoutType === "numbered_seat" ||
        tier.layoutType === "table_combo"
      ) {
        return {
          ...tier,
          seatingSectorId: null,
          layoutType: "general" as const,
          tierType:
            tier.tierType === "bundle" || tier.tierType === "addon"
              ? tier.tierType
              : ("general" as const),
          capacityPerUnit: 1,
        }
      }
      return tier
    }
    if (layoutSectorIds.has(sectorId)) return tier
    return {
      ...tier,
      seatingSectorId: null,
      layoutType: "general" as const,
      tierType:
        tier.tierType === "bundle" || tier.tierType === "addon"
          ? tier.tierType
          : ("general" as const),
      capacityPerUnit: 1,
    }
  })
}

/**
 * Pipeline único de preparación antes de autoguardado, RPC o publicación.
 * Alinea mapa, seating_layout y tickets para evitar SEATING_SECTOR_* en DB.
 */
export function prepareEventForPersist(
  data: EventFormValues,
  options: SanitizeTicketTiersOptions & {
    liveSectorIds?: Iterable<string>
    extraSectorIds?: Iterable<string>
  } = { mode: "update" },
): EventFormValues {
  let next = healEventFormInventory(data)
  const seatingArtifacts = resolveVenueSeatingArtifactsForPersist({
    hasSeatingPlan: next.basics.hasSeatingPlan,
    includesSeatingMap: next.venue.includesSeatingMap,
    venueMap: next.venue.venueMap,
    seatingLayout: next.venue.seatingLayout,
  })
  const map = seatingArtifacts.venueMap
  const seatingLayout = seatingArtifacts.seatingLayout
  const layoutSectorIds = collectSeatingLayoutSectorIds(seatingLayout)
  const liveSectorIds =
    options.liveSectorIds ??
    collectLiveSeatingSectorIds({
      venueMap: map,
      seatingLayout,
      extraIds: options.extraSectorIds,
    })

  const scheduleDayIds = next.basics.isMultiDay
    ? normalizeScheduleDaysFromForm(next.basics.scheduleDays ?? []).map(
        (day) => day.id,
      )
    : []
  const coerced = dedupeTicketsForPersist(
    collapseMultiDayOrphanTickets(
      coerceTicketsToLayoutSectors(next.tickets ?? [], layoutSectorIds),
      Boolean(next.basics.isMultiDay),
      scheduleDayIds,
    ),
  )

  next = {
    ...next,
    venue: {
      ...next.venue,
      venueMap: map,
      seatingLayout,
    },
    tickets: coerced,
  }

  return sanitizeEventSubmitPayload(next, {
    mode: options.mode,
    persistedIds: options.persistedIds,
    liveSectorIds,
  })
}

export function isSeatingPersistMismatchError(message: string): boolean {
  return /mapa y las entradas no coinciden|SEATING_SECTOR|SEATING_TIER_CONFIG|SEATING_LAYOUT|sector general .+ necesita precio|sector reservado .+ necesita al menos una mesa/i.test(
    message,
  )
}
