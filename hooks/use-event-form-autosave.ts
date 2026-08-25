"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import { autosaveEventDraft } from "@/app/actions/event-autosave"
import {
  eventInventoryFingerprint,
  formHasInventoryOrVenue,
} from "@/lib/events/event-inventory-fingerprint"
import {
  useEventFormStore,
  type ZoneTierPriceDraft,
} from "@/lib/stores/event-form-store"
import type { EventFormValues } from "@/lib/validations/event-form"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"
import {
  classifyPersistError,
  persistErrorUserMessage,
  PERSIST_ERROR_TITLES,
} from "@/lib/errors/persist-error"

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
    eventId,
    initialValues,
    venuePricingMap,
    zoneTierPricing,
    targetOrganizerId = null,
    enabled = true,
    flyerFile = null,
  } = input

  const setEventId = useEventFormStore((s) => s.setEventId)
  const setAutosaveStatus = useEventFormStore((s) => s.setAutosaveStatus)
  const storeEventId = useEventFormStore((s) => s.eventId)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)

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

  const persistedEventId = eventId ?? createdEventId ?? storeEventId

  useEffect(() => {
    latestRef.current = {
      ...latestRef.current,
      values: form.getValues(),
      venuePricingMap,
      zoneTierPricing,
      eventId: persistedEventId,
    }
    readyRef.current = true
  }, [form, venuePricingMap, zoneTierPricing, persistedEventId])

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
      !formHasInventoryOrVenue(values) &&
      (!snapshot.eventId ||
        eventInventoryFingerprint(values) === inventoryFingerprintRef.current)
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
          toast.error(PERSIST_ERROR_TITLES[result.source], {
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
        setCreatedEventId(result.eventId)
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
      const source = classifyPersistError(error)
      const message = persistErrorUserMessage(error, "Error de autoguardado")
      setAutosaveStatus("error", message)
      if (lastErrorToastRef.current !== message) {
        lastErrorToastRef.current = message
        toast.error(PERSIST_ERROR_TITLES[source], {
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

  function acknowledgeServerSnapshot(values: EventFormValues) {
    skipWatchRef.current = true
    markSaved(values)
  }

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
    runAutosaveRef.current = runAutosave
    scheduleSaveRef.current = scheduleSave
    flushAutosaveRef.current = flushAutosave
  })

  useEffect(() => {
    if (!enabled) return
    const subscription = form.watch(() => {
      const next = form.getValues()
      latestRef.current.values = next
      if (!readyRef.current) return
      if (skipWatchRef.current) {
        skipWatchRef.current = false
        return
      }
      setAutosaveStatus("dirty")
      scheduleSaveRef.current()
    })
    return () => subscription.unsubscribe()
  }, [enabled, form, setAutosaveStatus])

  useEffect(() => {
    if (!enabled || !readyRef.current) return
    latestRef.current.venuePricingMap = venuePricingMap
    scheduleSaveRef.current()
  }, [enabled, venuePricingMap])

  useEffect(() => {
    if (!enabled || !readyRef.current) return
    latestRef.current.zoneTierPricing = zoneTierPricing
    scheduleSaveRef.current()
  }, [enabled, zoneTierPricing])

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
    persistedEventId,
    flushAutosave,
    cancelPendingAutosave,
    waitForInFlightAutosave,
    markSaved,
    acknowledgeServerSnapshot,
  }
}
