import type { EventFormValues } from "@/lib/validations/event-form"

/**
 * After persist, keep the organizer's in-progress draft and only take
 * server-assigned identities (ticket UUIDs, venue id, flyer name).
 * Full `form.reset(server)` would paste coerced placeholders (dates, "Por definir").
 */
export function mergePersistedEventForm(
  current: EventFormValues,
  server: EventFormValues,
): EventFormValues {
  const usedServerIds = new Set<string>()
  const tickets = current.tickets.map((tier, index) => {
    if (tier.id) {
      usedServerIds.add(tier.id)
      return tier
    }
    const name = (tier.name ?? "").trim()
    const byName =
      name.length >= 2
        ? server.tickets.find(
            (candidate) =>
              Boolean(candidate.id) &&
              !usedServerIds.has(candidate.id as string) &&
              candidate.name.trim() === name,
          )
        : undefined
    const byIndex = server.tickets[index]
    const id =
      byName?.id ??
      (byIndex?.id && !usedServerIds.has(byIndex.id) ? byIndex.id : undefined)
    if (id) usedServerIds.add(id)
    return { ...tier, id }
  })

  return {
    ...current,
    basics: {
      ...current.basics,
      flyerName: current.basics.flyerName || server.basics.flyerName,
    },
    venue: {
      ...current.venue,
      existingVenueId:
        current.venue.existingVenueId || server.venue.existingVenueId,
    },
    tickets,
  }
}
