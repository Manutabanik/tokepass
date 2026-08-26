"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { UseFormGetValues } from "react-hook-form"

import { saveEventDraftV2 } from "@/app/actions/events-v2"
import { sanitizeEventDraftForPersist } from "@/lib/events/draft-seating-map-v2"
import {
  EDITOR_V2_AUTOSAVE_MS,
  type DraftSaveStatus,
} from "@/lib/events/editor-v2-ux"
import {
  toEventDraftV2Payload,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"


export type PersistDraftResult =
  | { success: true }
  | { success: false; error: string }

export function useEventDraftV2Persist(
  eventId: string,
  getValues: UseFormGetValues<EventDraftV2>,
  watched: unknown,
) {
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>("idle")
  const [saveError, setSaveError] = useState("")
  const [online, setOnline] = useState(true)
  const ready = useRef(false)
  const paused = useRef(false)
  const generation = useRef(0)

  const persistDraft = useCallback(async (): Promise<PersistDraftResult> => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSaveStatus("offline")
      return { success: false, error: "Sin conexión. El borrador quedó en este dispositivo." }
    }
    const current = ++generation.current
    setSaveStatus("saving")
    setSaveError("")
    const result = await saveEventDraftV2(
      eventId,
      toEventDraftV2Payload(sanitizeEventDraftForPersist(getValues())),
    )
    if (current !== generation.current) {
      return result.success
        ? { success: true }
        : { success: false, error: result.error }
    }
    if (!result.success) {
      setSaveStatus("error")
      setSaveError(result.error)
      return { success: false, error: result.error }
    }
    setSaveStatus("saved")
    return { success: true }
  }, [eventId, getValues])

  const flushAndPause = useCallback(async (): Promise<PersistDraftResult> => {
    paused.current = true
    generation.current += 1
    return persistDraft()
  }, [persistDraft])

  const resume = useCallback(() => {
    paused.current = false
  }, [])

  useEffect(() => {
    function onOnline() {
      setOnline(true)
      if (paused.current) return
      void persistDraft()
    }
    function onOffline() {
      setOnline(false)
      setSaveStatus("offline")
    }
    const frame = window.requestAnimationFrame(() => {
      if (!navigator.onLine) onOffline()
    })
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [persistDraft])

  useEffect(() => {
    if (!ready.current) {
      ready.current = true
      return
    }
    if (paused.current) return
    const timer = window.setTimeout(() => {
      if (paused.current) return
      void persistDraft()
    }, EDITOR_V2_AUTOSAVE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [eventId, persistDraft, watched])

  return {
    saveStatus,
    saveError,
    online,
    persistDraft,
    flushAndPause,
    resume,
  }
}
