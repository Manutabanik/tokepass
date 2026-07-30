import type { VenueLayoutType } from "@/types/venues"

export type TicketTierVisibility = "public" | "private"

export type TicketAccessBinding = {
  layoutType: VenueLayoutType
  seatingSectorId: string | null
  capacityPerUnit: number
}

/**
 * `null` / `"all"` = abono completo (todas las jornadas) o evento de fecha única.
 * Cualquier otro string debe coincidir con `events.schedule_days[].id`.
 */
export type TicketDayId = string | null

export const TICKET_TIER_VISIBILITY_VALUES = [
  "public",
  "private",
] as const satisfies readonly TicketTierVisibility[]

export const TICKET_DAY_ALL = "all" as const

export const TICKET_TIER_VISIBILITY_LABELS: Record<
  TicketTierVisibility,
  string
> = {
  public: "Visible en el catálogo",
  private: "Oculta (RRPP / enlace exclusivo)",
}
