"use client"

import { useEffect, useRef, useState } from "react"

export type DebouncedAutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"

export function useDebouncedAutosave<T>(options: {
  value: T
  delayMs?: number
  enabled?: boolean
  onSave?: (value: T) => void | Promise<void>
}): DebouncedAutosaveStatus {
  const { value, delayMs = 3000, enabled = true, onSave } = options
  const [status, setStatus] = useState<DebouncedAutosaveStatus>("idle")
  const skipFirst = useRef(true)
  const generation = useRef(0)
  const valueRef = useRef(value)
  const onSaveRef = useRef(onSave)
  valueRef.current = value
  onSaveRef.current = onSave

  useEffect(() => {
    if (!enabled) return
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    setStatus("dirty")
    const gen = ++generation.current
    const timer = window.setTimeout(() => {
      const save = onSaveRef.current
      if (!save) {
        setStatus("saved")
        return
      }
      setStatus("saving")
      void Promise.resolve(save(valueRef.current))
        .then(() => {
          if (generation.current === gen) setStatus("saved")
        })
        .catch(() => {
          if (generation.current === gen) setStatus("error")
        })
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs, enabled])

  return status
}
