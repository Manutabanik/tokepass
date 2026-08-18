"use client"

import { useEffect, useRef } from "react"
import type { UseFormReturn } from "react-hook-form"

import { autosaveEventDraft } from "@/app/actions/event-autosave"
import { eventInventoryFingerprint } from "@/lib/events/event-inventory-fingerprint"
import {
  useEventFormStore,
  type ZoneTierPriceDraft,
} from "@/lib/stores/event-form-store"
import type { EventFormValues } from "@/lib/validations/event-form"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"

const DEBOUNCE_MS = 1500

function sanitizeFormValues(values: EventFormValues): EventFormValues {
  return {
    ...values,
    venue: {
      ...values.venue,
      existingVenueId: values.venue.existingVenueId || null,
      latitude:
        values.venue.latitude != null && Number.isFinite(values.venue.latitude)
          ? values.venue.latitude
          : null,
      longitude:
        values.venue.longitude != null && Number.isFinite(values.venue.longitude)
          ? values.venue.longitude
          : null,
    },
    tickets: (values.tickets ?? []).map((tier) => ({
      ...tier,
      price: Number.isFinite(Number(tier.price)) ? Number(tier.price) : 0,
      capacity: Number.isFinite(Number(tier.capacity))
        ? Number(tier.capacity)
        : 1,
      listPrice:
        tier.listPrice == null || !Number.isFinite(Number(tier.listPrice))
          ? null
          : Number(tier.listPrice),
    })),
  }
}

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
}) {
  const {
    form,
    draftKey,
    eventId,
    initialValues,
    venuePricingMap,
    onVenuePricingMapChange,
    zoneTierPricing,
    onZoneTierPricingChange,
    targetOrganizerId = null,
    enabled = true,
    serverUpdatedAt = null,
  } = input

  const hydrateSession = useEventFormStore((s) => s.hydrateSession)
  const setFormValues = useEventFormStore((s) => s.setFormValues)
  const setVenuePricingMapStore = useEventFormStore((s) => s.setVenuePricingMap)
  const setZoneTierPricing = useEventFormStore((s) => s.setZoneTierPricing)
  const setEventId = useEventFormStore((s) => s.setEventId)
  const setAutosaveStatus = useEventFormStore((s) => s.setAutosaveStatus)
  const storeEventId = useEventFormStore((s) => s.eventId)

  const readyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const inventoryFingerprintRef = useRef(
    eventInventoryFingerprint(initialValues),
  )
  const scheduleSaveRef = useRef<() => void>(() => {})
  const flushAutosaveRef = useRef<() => void>(() => {})
  const latestRef = useRef({
    values: initialValues,
    venuePricingMap,
    zoneTierPricing,
    eventId: eventId ?? storeEventId,
    enabled,
    targetOrganizerId,
  })

  useEffect(() => {
    latestRef.current.enabled = enabled
    latestRef.current.targetOrganizerId = targetOrganizerId
  }, [enabled, targetOrganizerId])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const persistApi = useEventFormStore.persist
      if (!persistApi.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = persistApi.onFinishHydration(() => {
            unsub()
            resolve()
          })
        })
      }
      if (cancelled) return

      hydrateSession({
        draftKey,
        eventId,
        values: initialValues,
        venuePricingMap,
        zoneTierPricing,
        serverUpdatedAt,
      })
      const persisted = useEventFormStore.getState()
      if (persisted.values && persisted.draftKey === draftKey) {
        form.reset(persisted.values)
        onVenuePricingMapChange(persisted.venuePricingMap)
        onZoneTierPricingChange?.(persisted.zoneTierPricing)
      }
      latestRef.current = {
        ...latestRef.current,
        values: form.getValues(),
        venuePricingMap: useEventFormStore.getState().venuePricingMap,
        zoneTierPricing: useEventFormStore.getState().zoneTierPricing,
        eventId: eventId ?? useEventFormStore.getState().eventId,
      }
      inventoryFingerprintRef.current = eventInventoryFingerprint(
        latestRef.current.values,
      )
      readyRef.current = true
    }

    void boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hydrate
  }, [])

  useEffect(() => {
    latestRef.current = {
      ...latestRef.current,
      values: form.getValues(),
      venuePricingMap,
      zoneTierPricing,
      eventId: eventId ?? storeEventId,
    }
  }, [form, venuePricingMap, zoneTierPricing, eventId, storeEventId])

  async function runAutosave() {
    if (!readyRef.current || !latestRef.current.enabled) return
    if (savingRef.current) return
    const snapshot = latestRef.current
    const values = sanitizeFormValues(snapshot.values)
    const identityOnly =
      !snapshot.eventId ||
      eventInventoryFingerprint(values) === inventoryFingerprintRef.current
    savingRef.current = true
    setAutosaveStatus("saving")
    try {
      const result = await autosaveEventDraft({
        eventId: snapshot.eventId,
        values,
        zoneTierPricing: snapshot.zoneTierPricing,
        targetOrganizerId: snapshot.targetOrganizerId,
        identityOnly,
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
      if (result.venueId) {
        const current = latestRef.current.values
        latestRef.current.values = {
          ...current,
          venue: {
            ...current.venue,
            existingVenueId: result.venueId,
          },
        }
        form.setValue("venue.existingVenueId", result.venueId, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        })
      }
      setAutosaveStatus("saved")
      if (!identityOnly) {
        inventoryFingerprintRef.current = eventInventoryFingerprint(values)
      }
    } catch (error) {
      setAutosaveStatus(
        "error",
        error instanceof Error ? error.message : "Error de autoguardado",
      )
    } finally {
      savingRef.current = false
    }
  }

  function scheduleSave() {
    if (!readyRef.current || !latestRef.current.enabled) return
    setAutosaveStatus("dirty")
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void runAutosave()
    }, DEBOUNCE_MS)
  }

  function flushAutosave() {
    if (!readyRef.current) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    void runAutosave()
  }

  useEffect(() => {
    scheduleSaveRef.current = scheduleSave
    flushAutosaveRef.current = flushAutosave
  })

  useEffect(() => {
    if (!enabled) return
    const subscription = form.watch(() => {
      const next = form.getValues()
      latestRef.current.values = next
      if (!readyRef.current) return
      setFormValues(next)
      scheduleSaveRef.current()
    })
    return () => subscription.unsubscribe()
  }, [enabled, form, setFormValues])

  useEffect(() => {
    if (!enabled || !readyRef.current) return
    setVenuePricingMapStore(venuePricingMap)
    latestRef.current.venuePricingMap = venuePricingMap
    scheduleSaveRef.current()
  }, [enabled, venuePricingMap, setVenuePricingMapStore])

  useEffect(() => {
    if (!enabled || !readyRef.current) return
    setZoneTierPricing(zoneTierPricing)
    latestRef.current.zoneTierPricing = zoneTierPricing
    scheduleSaveRef.current()
  }, [enabled, zoneTierPricing, setZoneTierPricing])

  useEffect(() => {
    function onHide() {
      flushAutosaveRef.current()
    }
    window.addEventListener("beforeunload", onHide)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("beforeunload", onHide)
      document.removeEventListener("visibilitychange", onVisibility)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return {
    persistedEventId: storeEventId ?? eventId,
    flushAutosave,
  }
}
