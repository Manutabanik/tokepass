"use client"

import { useEffect } from "react"
import type { UseFormReturn } from "react-hook-form"

import {
  useEventFormStore,
  type ZoneTierPriceDraft,
} from "@/lib/stores/event-form-store"
import type { EventFormValues } from "@/lib/validations/event-form"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"

/**
 * TEMP ACID TEST: autosave is fully dead.
 * No debounce, no form.watch persist, no beforeunload flush.
 * Keep the hook so the wizard still receives persistedEventId.
 */
export function useEventFormAutosave(input: {
  form: UseFormReturn<EventFormValues>
  draftKey: string
  eventId: string | null
  initialValues: EventFormValues
  venuePricingMap: VenuePricingMap
  onVenuePricingMapChange: (map: VenuePricingMap) => void
  zoneTierPricing: ZoneTierPriceDraft[]
  onZoneTierPricingChange?: (rows: ZoneTierPriceDraft[]) => void
  targetOrganizerId?: string | null
  enabled?: boolean
  serverUpdatedAt?: number | null
  flyerFile?: File | null
}) {
  const setEventId = useEventFormStore((s) => s.setEventId)
  const storeEventId = useEventFormStore((s) => s.eventId)
  const persistedEventId = input.eventId ?? storeEventId

  useEffect(() => {
    if (input.eventId) setEventId(input.eventId)
  }, [input.eventId, setEventId])

  return {
    persistedEventId,
    flushAutosave: async () => {},
    cancelPendingAutosave: () => {},
    waitForInFlightAutosave: async () => {},
    markSaved: () => {},
    acknowledgeServerSnapshot: () => {},
  }
}
