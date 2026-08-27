"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { UseFormGetValues } from "react-hook-form"

import { saveEventDraftV2 } from "@/app/actions/events-v2"
import { sanitizeEventDraftForPersist } from "@/lib/events/draft-seating-map-v2"
import { persistErrorUserMessage } from "@/lib/errors/persist-error"
import {
  EDITOR_V2_AUTOSAVE_MS,
  withDraftPersistTimeout,
  type DraftSaveStatus,
} from "@/lib/events/editor-v2-ux"
import {
  parseEventDraftV2,
  toEventDraftV2Payload,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export type PersistDraftResult =
  | { success: true }
  | { success: false; error: string }

type QueuedPersist = {
  force: boolean
  waiters: Array<(result: PersistDraftResult) => void>
}

export function useEventDraftV2Persist(
  eventId: string,
  getValues: UseFormGetValues<EventDraftV2>,
  watched: unknown,
  options?: { onSaved?: (saved: EventDraftV2) => void },
) {
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>("idle")
  const [saveError, setSaveError] = useState("")
  const [online, setOnline] = useState(true)
  const ready = useRef(false)
  const paused = useRef(false)
  const generation = useRef(0)
  const lastFingerprint = useRef("")
  const busy = useRef(false)
  const queued = useRef<QueuedPersist | null>(null)
  const onSavedRef = useRef(options?.onSaved)
  useLayoutEffect(() => {
    onSavedRef.current = options?.onSaved
  }, [options?.onSaved])

  const runWrite = useCallback(
    async (shouldForce: boolean): Promise<PersistDraftResult> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSaveStatus("offline")
        return {
          success: false,
          error: "Sin conexión. El borrador quedó en este dispositivo.",
        }
      }
      const snapshot = getValues()
      const sanitized = sanitizeEventDraftForPersist(snapshot)
      const payload = toEventDraftV2Payload(sanitized)
      const fingerprint = JSON.stringify(payload)
      if (!shouldForce && fingerprint === lastFingerprint.current) {
        setSaveStatus("saved")
        setSaveError("")
        try {
          onSavedRef.current?.(parseEventDraftV2(payload))
        } catch {
          // reset is best-effort; the fingerprint already matches
        }
        return { success: true }
      }
      const current = ++generation.current
      setSaveStatus("saving")
      setSaveError("")
      try {
        const result = await withDraftPersistTimeout(
          saveEventDraftV2(eventId, payload),
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
        lastFingerprint.current = fingerprint
        setSaveStatus("saved")
        const saved = parseEventDraftV2(result.draftState)
        try {
          onSavedRef.current?.(saved)
        } catch {
          // reset is best-effort; the draft already landed on the server
        }
        return { success: true }
      } catch (error) {
        const message = persistErrorUserMessage(error)
        if (current !== generation.current) {
          return { success: false, error: message }
        }
        generation.current += 1
        setSaveStatus("error")
        setSaveError(message)
        return { success: false, error: message }
      }
    },
    [eventId, getValues],
  )

  const persistDraft = useCallback(
    async (force?: boolean): Promise<PersistDraftResult> => {
      const shouldForce = force === true
      if (busy.current) {
        return await new Promise((resolve) => {
          const current = queued.current
          if (current) {
            current.force = current.force || shouldForce
            current.waiters.push(resolve)
            return
          }
          queued.current = { force: shouldForce, waiters: [resolve] }
        })
      }
      busy.current = true
      try {
        let pendingForce = shouldForce
        let result = await runWrite(pendingForce)
        for (;;) {
          const next = queued.current
          if (!next) return result
          queued.current = null
          result = await runWrite(next.force)
          for (const waiter of next.waiters) waiter(result)
        }
      } finally {
        try {
          while (queued.current) {
            const leftover = queued.current
            queued.current = null
            const leftoverResult = await runWrite(leftover.force)
            for (const waiter of leftover.waiters) waiter(leftoverResult)
          }
        } finally {
          busy.current = false
        }
        const raced = queued.current as QueuedPersist | null
        if (raced) {
          queued.current = null
          void persistDraft(raced.force).then((result) => {
            for (const waiter of raced.waiters) waiter(result)
          })
        }
      }
    },
    [runWrite],
  )

  const flushAndPause = useCallback(async (): Promise<PersistDraftResult> => {
    paused.current = true
    return persistDraft(true)
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
