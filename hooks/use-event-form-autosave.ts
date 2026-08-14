"use client"

import { useEffect, useRef } from "react"
import type { UseFormReturn } from "react-hook-form"

import { autosaveEventDraft } from "@/app/actions/event-autosave"
import {
  useEventFormStore,
  type ZoneTierPriceDraft,
} from "@/lib/stores/event-form-store"
import type { EventFormValues } from "@/lib/validations/event-form"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"

const DEBOUNCE_MS = 1800

export function useEventFormAutosave(input: {
  form: UseFormReturn<EventFormValues>
  draftKey: string
  eventId: string | null
  initialValues: EventFormValues
  venuePricingMap: VenuePricingMap
  onVenuePricingMapChange: (map: VenuePricingMap) => void
  zoneTierPricing: ZoneTierPriceDraft[]
  targetOrganizerId?: string | null
  enabled?: boolean
}) {
  const {
    form,
    draftKey,
    eventId,
    initialValues,
    venuePricingMap,
    onVenuePricingMapChange,
    zoneTierPricing,
    targetOrganizerId = null,
    enabled = true,
  } = input

  const hydrateSession = useEventFormStore((s) => s.hydrateSession)
  const setFormValues = useEventFormStore((s) => s.setFormValues)
  const setVenuePricingMapStore = useEventFormStore((s) => s.setVenuePricingMap)
  const setZoneTierPricing = useEventFormStore((s) => s.setZoneTierPricing)
  const setEventId = useEventFormStore((s) => s.setEventId)
  const setAutosaveStatus = useEventFormStore((s) => s.setAutosaveStatus)
  const storeEventId = useEventFormStore((s) => s.eventId)

  const hydratedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef({
    values: initialValues,
    venuePricingMap,
    zoneTierPricing,
    eventId: eventId ?? storeEventId,
  })

  // Hydrate once from localStorage (create) or server (edit)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    hydrateSession({
      draftKey,
      eventId,
      values: initialValues,
      venuePricingMap,
      zoneTierPricing,
    })
    const persisted = useEventFormStore.getState()
    if (
      draftKey === "create" &&
      persisted.values &&
      persisted.draftKey === "create" &&
      !eventId
    ) {
      form.reset(persisted.values)
      onVenuePricingMapChange(persisted.venuePricingMap)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hydrate
  }, [])

  // Keep refs fresh
  useEffect(() => {
    latestRef.current = {
      values: form.getValues(),
      venuePricingMap,
      zoneTierPricing,
      eventId: eventId ?? storeEventId,
    }
  }, [form, venuePricingMap, zoneTierPricing, eventId, storeEventId])

  // Mirror RHF → Zustand on every change
  useEffect(() => {
    if (!enabled) return
    const subscription = form.watch((values) => {
      const next = values as EventFormValues
      latestRef.current.values = next
      setFormValues(next)
      scheduleSave()
    })
    return () => subscription.unsubscribe()
  }, [enabled, form, setFormValues])

  useEffect(() => {
    if (!enabled) return
    setVenuePricingMapStore(venuePricingMap)
    latestRef.current.venuePricingMap = venuePricingMap
    scheduleSave()
  }, [enabled, venuePricingMap, setVenuePricingMapStore])

  useEffect(() => {
    if (!enabled) return
    setZoneTierPricing(zoneTierPricing)
    latestRef.current.zoneTierPricing = zoneTierPricing
    scheduleSave()
  }, [enabled, zoneTierPricing, setZoneTierPricing])

  function scheduleSave() {
    if (!enabled) return
    setAutosaveStatus("dirty")
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void runAutosave()
    }, DEBOUNCE_MS)
  }

  async function runAutosave() {
    const snapshot = latestRef.current
    setAutosaveStatus("saving")
    try {
      const result = await autosaveEventDraft({
        eventId: snapshot.eventId,
        values: snapshot.values,
        zoneTierPricing: snapshot.zoneTierPricing,
        targetOrganizerId,
      })
      if (!result.ok) {
        setAutosaveStatus("error", result.error)
        return
      }
      if (result.mode === "skipped") {
        setAutosaveStatus("dirty")
        return
      }
      if (result.eventId) {
        setEventId(result.eventId)
        latestRef.current.eventId = result.eventId
      }
      setAutosaveStatus("saved")
    } catch (error) {
      setAutosaveStatus(
        "error",
        error instanceof Error ? error.message : "Error de autoguardado",
      )
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return {
    persistedEventId: storeEventId ?? eventId,
  }
}
