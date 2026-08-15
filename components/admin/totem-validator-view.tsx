"use client"

import { useEffect } from "react"

import { useTotemScanner } from "@/hooks/use-totem-scanner"

export function TotemRestOverlay({
  enabled,
  onScan,
}: {
  enabled: boolean
  onScan: (code: string) => void
}) {
  const { inputRef, focusTrap } = useTotemScanner({
    enabled,
    onScan,
    cooldownMs: 1500,
  })

  useEffect(() => {
    if (!enabled) return
    const previous = document.body.style.userSelect
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.userSelect = previous
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div
      className="absolute inset-0 flex select-none flex-col items-center justify-center bg-black/45 px-6 text-center"
      onClick={focusTrap}
    >
      <input
        ref={inputRef}
        data-totem-hid-trap="true"
        type="text"
        inputMode="none"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Entrada del lector USB HID"
        className="pointer-events-none absolute opacity-0"
        style={{ position: "absolute", left: -9999, width: 1, height: 1 }}
        onBlur={focusTrap}
      />
      <p className="max-w-[16ch] text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl">
        APOYÁ TU CÓDIGO QR ACÁ
      </p>
    </div>
  )
}
