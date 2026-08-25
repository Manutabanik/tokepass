import type { VenuePricingMap } from "@/lib/seating/venue-adapter"
import type { EventFormValues } from "@/lib/validations/event-form"

export const EVENT_WIZARD_STEP_COUNT = 5

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error"

export type ZoneTierPriceDraft = {
  id?: string
  sectorKey: string
  sectorName: string
  ticketTierId: string
  ticketTierName: string
  price: number
  tableNumberStart: number | null
  tableNumberEnd: number | null
}

export type EventFormSessionState = {
  draftKey: string
  eventId: string | null
  values: EventFormValues | null
  venuePricingMap: VenuePricingMap
  zoneTierPricing: ZoneTierPriceDraft[]
  wizardStep: number
  updatedAt: number
}

/** @deprecated El wizard ya no persiste en localStorage; solo tipos compartidos. */
export const EVENT_FORM_STORAGE_KEY = "tokepass.event-form.v1"
