import type { EventFormValues } from "@/lib/validations/event-form"

type TicketDraft = EventFormValues["tickets"][number]

export type SanitizeTicketTiersOptions = {
  mode: "create" | "update"
  /** IDs que el cliente sabe que existen en DB (p. ej. hidratación inicial). */
  persistedIds?: Iterable<string>
}

function withoutClientIdentity(tier: TicketDraft): TicketDraft {
  const next = { ...tier }
  delete next.id
  delete next.isNew
  if (!next.phases?.length) return next
  next.phases = next.phases.map((phase) => {
    const copy = { ...phase }
    delete copy.id
    return copy
  })
  return next
}

/**
 * Quita IDs temporales / marcados como nuevos para que el RPC inserte
 * en lugar de intentar un UPDATE contra un UUID inexistente.
 * No toca IDs persistidos conocidos: esos tiers se actualizan.
 */
export function sanitizeTicketTiersForPersist(
  tickets: TicketDraft[],
  options: SanitizeTicketTiersOptions,
): TicketDraft[] {
  const known = new Set(
    [...(options.persistedIds ?? [])].filter((id) => id.trim().length > 0),
  )

  return tickets.map((tier) => {
    if (options.mode === "create" || tier.isNew === true || !tier.id) {
      return withoutClientIdentity(tier)
    }
    if (known.size > 0 && !known.has(tier.id)) {
      return withoutClientIdentity(tier)
    }
    const next = { ...tier }
    delete next.isNew
    return next
  })
}

/**
 * Cruza el payload con los IDs reales de `ticket_tiers` del evento.
 * Un `id` que no existe en DB se elimina para forzar INSERT.
 */
export function reconcileTicketTierIds(
  tickets: TicketDraft[],
  existingIds: Iterable<string>,
): TicketDraft[] {
  const live = new Set(
    [...existingIds].filter((id) => id.trim().length > 0),
  )

  return tickets.map((tier) => {
    if (!tier.id || !live.has(tier.id)) {
      return withoutClientIdentity(tier)
    }
    const next = { ...tier }
    delete next.isNew
    return next
  })
}
