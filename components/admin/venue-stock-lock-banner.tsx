"use client"

import { useLayoutEffect } from "react"
import { ShieldAlert, X } from "lucide-react"

import { blurActiveElement } from "@/lib/dom/blur-active-element"

export function VenueStockLockBanner({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  useLayoutEffect(() => {
    if (!message) return
    blurActiveElement()
  }, [message])

  if (!message) return null

  return (
    <div
      role="status"
      data-editor-chrome
      className="pointer-events-auto absolute top-16 left-4 z-[120] max-w-[min(22rem,calc(100%-8rem))] rounded-xl border border-amber-500/40 bg-zinc-950/95 px-3 py-2 text-xs text-amber-50 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden="true" />
        <p className="min-w-0 flex-1 leading-snug">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="grid size-6 shrink-0 place-items-center rounded-full text-amber-100/80 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar aviso"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
