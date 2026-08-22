"use client"

import { useCallback, useEffect, useRef } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import { autosaveEventDraft } from "@/app/actions/event-autosave"
import { eventInventoryFingerprint } from "@/lib/events/event-inventory-fingerprint"
import {
  useEventFormStore,
  type ZoneTierPriceDraft,
} from "@/lib/stores/event-form-store"
import type { EventFormValues } from "@/lib/validations/event-form"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"

/** Autoguardado de borrador: 1.5s después de que el usuario deja de escribir. */
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
  flyerFile?: File | null
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
    flyerFile = null,
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
  const queuedRef = useRef(false)
  const skipWatchRef = useRef(false)
  const lastSavedKeyRef = useRef<string | null>(null)
  const lastErrorToastRef = useRef<string | null>(null)
  const flyerRef = useRef<File | null>(flyerFile)
  const inventoryFingerprintRef = useRef(
    eventInventoryFingerprint(initialValues),
  )
  const scheduleSaveRef = useRef<() => void>(() => {})
  const flushAutosaveRef = useRef<() => void | Promise<void>>(() => {})
  const runAutosaveRef = useRef<() => Promise<void>>(async () => {})
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
    flyerRef.current = flyerFile
  }, [flyerFile])

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
    if (savingRef.current) {
      queuedRef.current = true
      return
    }
    const snapshot = latestRef.current
    const values = sanitizeFormValues(snapshot.values)
    const payloadKey = JSON.stringify(values)
    if (snapshot.eventId && lastSavedKeyRef.current === payloadKey) {
      setAutosaveStatus("saved")
      return
    }
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
        flyer: flyerRef.current,
      })
      if (!result.ok) {
        setAutosaveStatus("error", result.error)
        if (lastErrorToastRef.current !== result.error) {
          lastErrorToastRef.current = result.error
          toast.error("No se pudo guardar el borrador", {
            description: result.error,
          })
        }
        return
      }
      lastErrorToastRef.current = null
      if (result.mode === "skipped") {
        setAutosaveStatus("dirty")
        return
      }
      if (result.eventId) {
        setEventId(result.eventId)
        latestRef.current.eventId = result.eventId
      }
      if (result.venueId && result.venueId !== values.venue.existingVenueId) {
        const current = latestRef.current.values
        latestRef.current.values = {
          ...current,
          venue: {
            ...current.venue,
            existingVenueId: result.venueId,
          },
        }
        skipWatchRef.current = true
        form.setValue("venue.existingVenueId", result.venueId, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        })
      }
      lastSavedKeyRef.current = JSON.stringify(
        sanitizeFormValues(latestRef.current.values),
      )
      setAutosaveStatus("saved")
      if (!identityOnly) {
        inventoryFingerprintRef.current = eventInventoryFingerprint(values)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error de autoguardado"
      setAutosaveStatus("error", message)
      if (lastErrorToastRef.current !== message) {
        lastErrorToastRef.current = message
        toast.error("No se pudo guardar el borrador", {
          description: message,
        })
      }
    } finally {
      savingRef.current = false
      if (queuedRef.current) {
        queuedRef.current = false
        await runAutosave()
      }
    }
  }

  function cancelPendingAutosave() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    queuedRef.current = false
  }

  async function waitForInFlightAutosave() {
    cancelPendingAutosave()
    while (savingRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 40))
    }
  }

  function markSaved(values: EventFormValues) {
    lastSavedKeyRef.current = JSON.stringify(sanitizeFormValues(values))
    inventoryFingerprintRef.current = eventInventoryFingerprint(values)
    setAutosaveStatus("saved")
  }

  runAutosaveRef.current = runAutosave

  const scheduleSave = useCallback(() => {
    if (!readyRef.current || !latestRef.current.enabled) return
    setAutosaveStatus("dirty")
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void runAutosaveRef.current()
    }, DEBOUNCE_MS)
  }, [setAutosaveStatus])

  const flushAutosave = useCallback(async () => {
    if (!readyRef.current) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    queuedRef.current = false
    await runAutosaveRef.current()
  }, [])

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
      if (skipWatchRef.current) {
        skipWatchRef.current = false
        return
      }
      setAutosaveStatus("dirty")
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
    cancelPendingAutosave,
    waitForInFlightAutosave,
    markSaved,
  }
}
