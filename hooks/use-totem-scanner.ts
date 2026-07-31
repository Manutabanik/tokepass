"use client"

import { useCallback, useEffect, useRef } from "react"

const HID_INTER_CHAR_GAP_MS = 80
const DEFAULT_COOLDOWN_MS = 1000

type UseTotemScannerOptions = {
  enabled: boolean
  onScan: (code: string) => void
  cooldownMs?: number
}

/**
 * Captura códigos de lectores USB HID (teclado virtual).
 * Bufferiza keydowns rápidos y dispara al recibir Enter.
 */
export function useTotemScanner({
  enabled,
  onScan,
  cooldownMs = DEFAULT_COOLDOWN_MS,
}: UseTotemScannerOptions) {
  const bufferRef = useRef("")
  const lastKeyAtRef = useRef(0)
  const cooldownUntilRef = useRef(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const focusTrap = useCallback(() => {
    if (!enabled) return
    const node = inputRef.current
    if (!node) return
    if (document.activeElement === node) return
    window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true })
    }, 100)
  }, [enabled])

  const flushBuffer = useCallback(() => {
    const code = bufferRef.current.trim()
    bufferRef.current = ""
    if (!code) return

    const now = Date.now()
    if (now < cooldownUntilRef.current) return
    cooldownUntilRef.current = now + cooldownMs
    onScanRef.current(code)
  }, [cooldownMs])

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = ""
      return
    }

    focusTrap()

    function onKeyDown(event: KeyboardEvent) {
      if (!enabled) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isTrap =
        target === inputRef.current ||
        target?.dataset?.totemHidTrap === "true"

      // Evita capturar tipeo real en inputs de UI (salvo el trap oculto).
      if (
        !isTrap &&
        (tag === "input" || tag === "textarea" || target?.isContentEditable)
      ) {
        return
      }

      const now = Date.now()
      if (
        bufferRef.current.length > 0 &&
        now - lastKeyAtRef.current > HID_INTER_CHAR_GAP_MS
      ) {
        bufferRef.current = ""
      }
      lastKeyAtRef.current = now

      if (event.key === "Enter") {
        event.preventDefault()
        flushBuffer()
        return
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        bufferRef.current += event.key
      }
    }

    function onPointerDown() {
      focusTrap()
    }

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("visibilitychange", focusTrap)

    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("visibilitychange", focusTrap)
    }
  }, [enabled, flushBuffer, focusTrap])

  return {
    inputRef,
    focusTrap,
  }
}
