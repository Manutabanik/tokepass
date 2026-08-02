"use client"

import { MonitorSmartphone } from "lucide-react"
import { useEffect } from "react"

import { useTotemScanner } from "@/hooks/use-totem-scanner"
import { cn } from "@/lib/utils"

type TotemValidatorViewProps = {
  enabled: boolean
  eventTitle?: string | null
  hasManifest: boolean
  onScan: (code: string) => void
  className?: string
}

/**
 * Vista idle inmersiva del tótem. Success/error los pinta el shell del escáner.
 */
export function TotemValidatorView({
  enabled,
  eventTitle,
  hasManifest,
  onScan,
  className,
}: TotemValidatorViewProps) {
  const { inputRef, focusTrap } = useTotemScanner({
    enabled,
    onScan,
    cooldownMs: 1000,
  })

  useEffect(() => {
    if (!enabled) return
    const previous = document.body.style.userSelect
    document.body.style.userSelect = "none"
    const meta = document.querySelector('meta[name="viewport"]')
    const previousContent = meta?.getAttribute("content")
    meta?.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
    )
    return () => {
      document.body.style.userSelect = previous
      if (meta && previousContent != null) {
        meta.setAttribute("content", previousContent)
      }
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div
      className={cn(
        "absolute inset-0 flex select-none flex-col items-center justify-center bg-black px-6 text-center",
        className,
      )}
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

      <div className="relative mb-10 grid place-items-center">
        <div className="absolute size-56 animate-pulse rounded-full bg-violet-400/10 blur-2xl" />
        <div className="absolute size-40 animate-[ping_2.4s_ease-in-out_infinite] rounded-full border border-violet-400/30" />
        <div className="relative size-28 overflow-hidden rounded-[2rem] bg-black shadow-[0_0_40px_rgba(167,139,250,0.3)] ring-1 ring-violet-400/40">
          <img
            src="/brand/tokepass-mark.png"
            alt="Tokepass"
            width={112}
            height={112}
            className="size-full object-cover"
          />
        </div>
      </div>

      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300/90">
        <MonitorSmartphone className="size-3.5" aria-hidden="true" />
        Tokepass · modo tótem · USB HID
      </p>

      <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">
        Apoyá tu código QR o ticket físico aquí
      </h2>

      <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
        Sin cámara. El lector hardware valida al instante. No toques la
        pantalla.
      </p>

      {eventTitle ? (
        <p className="mt-8 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300">
          {eventTitle}
        </p>
      ) : null}

      <p
        className={cn(
          "mt-4 text-xs font-semibold uppercase tracking-[0.16em]",
          hasManifest ? "text-violet-300" : "text-amber-300",
        )}
      >
        {hasManifest
          ? "Manifiesto local listo · validación offline"
          : "Sin manifiesto · se requiere red para validar"}
      </p>
    </div>
  )
}
