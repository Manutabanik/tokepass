import { z } from "zod"

import { emptyToNull, optionalSectorKey } from "@/lib/validations/relation-id"

/** Mismo sentinela que `UNASSIGNED_SECTOR_VALUE` del dropdown. */
const UNASSIGNED_SECTOR_VALUE = "__none__"

type TicketSectorFields = {
  seatingSectorId?: unknown
  seating_sector_id?: unknown
  sector_id?: unknown
}

function asOptionalSectorKey(value: unknown): string | null {
  const next = emptyToNull(value)
  if (next == null) return null
  if (typeof next !== "string") return null
  const trimmed = next.trim()
  if (!trimmed || trimmed === UNASSIGNED_SECTOR_VALUE) return null
  return trimmed
}

/** `sector_id` / `seating_sector_id` / `seatingSectorId`. Vacío, null o undefined = SKU flotante. */
export function resolveTicketSectorId(
  row: TicketSectorFields | null | undefined,
): string | null {
  if (row == null) return null
  return (
    asOptionalSectorKey(row.seatingSectorId) ??
    asOptionalSectorKey(row.seating_sector_id) ??
    asOptionalSectorKey(row.sector_id)
  )
}

export function normalizeTicketSectorInput(value: unknown): unknown {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return value
  }
  const row = value as TicketSectorFields & Record<string, unknown>
  if (
    !("seatingSectorId" in row) &&
    !("seating_sector_id" in row) &&
    !("sector_id" in row)
  ) {
    return value
  }
  return {
    ...row,
    seatingSectorId: resolveTicketSectorId(row),
  }
}

const ticketSkuCapacitySchema = z
  .number({ error: "Indicá la capacidad de esta entrada." })
  .int()
  .min(1, "La cantidad de personas debe ser mayor a cero.")

/**
 * Contrato de alta de SKU comercial: el sector es opcional.
 * `max_capacity` es alias de `capacity` / `total_capacity`.
 */
export const TicketSkuCreateSchema = z.preprocess((value) => {
  const withSector = normalizeTicketSectorInput(value)
  if (
    withSector == null ||
    typeof withSector !== "object" ||
    Array.isArray(withSector)
  ) {
    return withSector
  }
  const row = withSector as Record<string, unknown>
  return {
    ...row,
    capacity: row.capacity ?? row.max_capacity ?? row.total_capacity,
  }
}, z.object({
  name: z.string().trim().min(2, "Ingresá un nombre para el tipo de entrada."),
  capacity: ticketSkuCapacitySchema,
  seatingSectorId: optionalSectorKey,
  seating_sector_id: optionalSectorKey,
  sector_id: optionalSectorKey,
  max_capacity: ticketSkuCapacitySchema.optional(),
  total_capacity: ticketSkuCapacitySchema.optional(),
}))

export type TicketSkuCreateValues = z.infer<typeof TicketSkuCreateSchema>
