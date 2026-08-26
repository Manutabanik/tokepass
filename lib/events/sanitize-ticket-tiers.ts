import { APP_ERRORS } from "@/lib/errors/app-error"
import { assignableLogicalSectorIds } from "@/lib/inventory/logical-sectors"
import { eventHasActiveSeatingMap } from "@/lib/inventory/map-enablement"
import { listVenuePriceGroups } from "@/lib/seating/venue-price-groups"
import { layoutTypeForMapSectorId } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"
import { parseVenueMap } from "@/types/venue-map"

export const ORPHAN_SEATING_SECTOR_MESSAGE =
  APP_ERRORS.SEATING_SECTOR_MISMATCH.message

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

function addSectorId(target: Set<string>, value: unknown) {
  if (typeof value !== "string") return
  const id = value.trim()
  if (id) target.add(id)
}

function addIdsFromSeatingLayout(target: Set<string>, layout: unknown) {
  const rows = Array.isArray(layout)
    ? layout
    : layout && typeof layout === "object"
      ? [layout]
      : []
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const record = row as { id?: unknown; sector_id?: unknown }
    addSectorId(target, record.id)
    addSectorId(target, record.sector_id)
  }
}

/**
 * IDs de sector que existen en el plano actual (mapa + seating_layout).
 * No usa claves huérfanas del pricing map: esas son las que rompen el RPC.
 */
export function collectLiveSeatingSectorIds(input: {
  venueMap?: unknown
  seatingLayout?: unknown
  extraIds?: Iterable<string>
}): Set<string> {
  const ids = new Set<string>()
  const map = parseVenueMap(input.venueMap)
  for (const sector of map.sectors) addSectorId(ids, sector.id)
  for (const zone of map.zones ?? []) addSectorId(ids, zone.id)
  for (const element of map.elements ?? []) {
    addSectorId(ids, element.id)
    addSectorId(ids, element.groupId)
  }
  for (const group of listVenuePriceGroups(map)) {
    if (group.match.kind === "sector" || group.match.kind === "zone") {
      addSectorId(ids, group.match.id)
    } else if (group.match.kind === "group") {
      addSectorId(ids, group.match.groupId)
    } else {
      addSectorId(ids, group.match.ids[0] ?? group.key)
    }
  }
  addIdsFromSeatingLayout(ids, input.seatingLayout)
  for (const extra of input.extraIds ?? []) addSectorId(ids, extra)
  return ids
}

type DetachableTicket = {
  seatingSectorId?: string | null
  seating_sector_id?: string | null
  sectorId?: string | null
}

/** Eventos sin mapa: las entradas generales no se atan a un sector. */
export function detachTicketsFromSeatingPlan<T extends DetachableTicket>(
  tickets: T[],
): T[] {
  return tickets.map((tier) => ({
    ...tier,
    seatingSectorId: null,
    seating_sector_id: null,
    sectorId: "",
  }))
}

/**
 * Conserva el sector si es lógico asignable, butaca/mesa del mapa,
 * o una zona GA del plano visual. Desacopla entradas generales de
 * sectores numerados para no romper el RPC.
 */
export function resolvePersistableTicketSectorId(input: {
  sectorId: string | null | undefined
  layoutType?: string | null
  tierType?: string | null
  liveSectorIds: Iterable<string>
  assignableSectorIds: Iterable<string>
  venueMap?: unknown
}): string | null {
  const sectorId = input.sectorId?.trim() || null
  if (!sectorId) return null
  const assignable = new Set(
    [...input.assignableSectorIds].filter((id) => id.trim().length > 0),
  )
  if (assignable.has(sectorId)) return sectorId
  const live = new Set(
    [...input.liveSectorIds].filter((id) => id.trim().length > 0),
  )
  if (!live.has(sectorId)) return null
  const isSeated =
    input.layoutType === "numbered_seat" ||
    input.layoutType === "table_combo" ||
    input.tierType === "seated"
  if (isSeated) return sectorId
  return layoutTypeForMapSectorId(parseVenueMap(input.venueMap), sectorId) ===
    "general"
    ? sectorId
    : null
}

/** Anula seatingSectorId que no existen en el plano vivo. */
export function sanitizeSeatingSectorIds<T extends DetachableTicket>(
  tickets: T[],
  liveSectorIds: Iterable<string>,
): T[] {
  const live = new Set(
    [...liveSectorIds].filter((id) => id.trim().length > 0),
  )
  return tickets.map((tier) => {
    const camel = tier.seatingSectorId?.trim() || ""
    const snake =
      typeof tier.seating_sector_id === "string"
        ? tier.seating_sector_id.trim()
        : ""
    const legacy =
      typeof tier.sectorId === "string" ? tier.sectorId.trim() : ""
    const sectorId = camel || snake || legacy || null
    if (sectorId && live.has(sectorId)) {
      return {
        ...tier,
        seatingSectorId: sectorId,
        seating_sector_id: sectorId,
        sectorId,
      }
    }
    return {
      ...tier,
      seatingSectorId: null,
      seating_sector_id: null,
      sectorId: "",
    }
  })
}

const LIVE_MAP_KEYS = new Set([
  "venuemap",
  "venue_map",
  "seatinglayout",
  "seating_layout",
])

const SECTOR_FK_KEYS = new Set([
  "seatingsectorid",
  "seating_sector_id",
  "sectorid",
  "sectorkey",
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * Recorre el payload y anula FKs de sector que ya no existen en el plano.
 * No muta el mapa ni el seating_layout: ahí viven los IDs válidos.
 */
export function sanitizeDeepSeatingRefs<T>(
  value: T,
  liveSectorIds: Iterable<string>,
): T {
  const live = new Set(
    [...liveSectorIds].filter((id) => id.trim().length > 0),
  )

  function walk(node: unknown): unknown {
    if (node == null) return node
    if (Array.isArray(node)) return node.map((item) => walk(item))
    if (!isPlainObject(node)) return node

    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node)) {
      const normalized = key.toLowerCase()
      if (LIVE_MAP_KEYS.has(normalized)) {
        next[key] = child
        continue
      }
      if (SECTOR_FK_KEYS.has(normalized)) {
        const id = typeof child === "string" ? child.trim() : ""
        next[key] = id && live.has(id) ? id : null
        continue
      }
      next[key] = walk(child)
    }
    return next
  }

  return walk(value) as T
}

export function sanitizeEventSubmitPayload(
  data: EventFormValues,
  options: SanitizeTicketTiersOptions & {
    liveSectorIds?: Iterable<string>
  },
): EventFormValues {
  const assignableIds = new Set(
    assignableLogicalSectorIds(data.venue.zones, data.venue.venueMap),
  )
  const live =
    options.liveSectorIds ??
    collectLiveSeatingSectorIds({
      venueMap: data.venue.venueMap,
      seatingLayout: data.venue.seatingLayout,
      extraIds: assignableIds,
    })
  const mapActive = eventHasActiveSeatingMap({
    hasSeatingPlan: data.basics.hasSeatingPlan,
    includesSeatingMap: data.venue.includesSeatingMap,
    venueMap: data.venue.venueMap,
  })
  const prepared = mapActive
    ? (data.tickets ?? []).map((tier) => ({
        ...tier,
        seatingSectorId: resolvePersistableTicketSectorId({
          sectorId: tier.seatingSectorId,
          layoutType: tier.layoutType,
          tierType: tier.tierType,
          liveSectorIds: live,
          assignableSectorIds: assignableIds,
          venueMap: data.venue.venueMap,
        }),
      }))
    : detachTicketsFromSeatingPlan(data.tickets ?? [])
  const tickets = sanitizeSeatingSectorIds(
    sanitizeTicketTiersForPersist(prepared, options),
    mapActive ? live : [],
  )
  return sanitizeDeepSeatingRefs({ ...data, tickets }, live)
}

export function isSeatingSectorRpcError(message: string) {
  return /SEATING_SECTOR_NOT_FOUND|SEATING_LAYOUT_NOT_FOUND|SEATING_LAYOUT_TYPE_MISMATCH|SEATING_SECTOR_EMPTY/i.test(
    message,
  )
}

function seatingErrorText(error: unknown): string {
  if (error == null) return ""
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (typeof error === "object") {
    const row = error as {
      code?: unknown
      message?: unknown
      details?: unknown
      hint?: unknown
      error?: unknown
    }
    return [row.code, row.message, row.details, row.hint, row.error]
      .filter((part) => part != null && String(part).trim())
      .join(" ")
  }
  return String(error)
}

export function seatingPersistUserMessage(error: unknown): string | null {
  const text = seatingErrorText(error)
  if (!text) return null
  if (isSeatingSectorRpcError(text)) return ORPHAN_SEATING_SECTOR_MESSAGE
  if (/23514/i.test(text) && /seating|sector/i.test(text)) {
    return ORPHAN_SEATING_SECTOR_MESSAGE
  }
  if (
    /23505/i.test(text) &&
    /ticket_tiers_event_sector/i.test(text)
  ) {
    return "Ese sector del mapa ya tiene una entrada para el mismo día. Revisá las jornadas o el nombre de la tarifa."
  }
  return null
}

export function isRelationalIntegrityError(message: string) {
  if (isSeatingSectorRpcError(message)) return true
  return /23503|foreign key|event_seating_sectors|seating_sector_id/i.test(
    message,
  )
}
