import type { VenueLayoutType } from "@/types/venues"

export type { SeatingType } from "@/types/venue-map"

export type EventVisibility = "public" | "private" | "guest_list_only"

export type EventAccessConfiguration = {
  tierId: string
  layoutType: VenueLayoutType
  seatingSectorId: string | null
  capacityPerUnit: number
}

export type ScheduleDay = {
  id: string
  title: string
  /** ISO timestamptz */
  start_time: string
  /** ISO timestamptz */
  end_time: string
}

export const EVENT_VISIBILITY_VALUES = [
  "public",
  "private",
  "guest_list_only",
] as const satisfies readonly EventVisibility[]

export const EVENT_VISIBILITY_LABELS: Record<EventVisibility, string> = {
  public: "Evento público",
  private: "Evento privado",
  guest_list_only: "Solo lista de invitados",
}
