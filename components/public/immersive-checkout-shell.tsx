"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function ImmersiveCheckoutShell({
  map,
  panel,
  paying = false,
  onDismissPay,
}: {
  map: ReactNode
  panel: ReactNode
  paying?: boolean
  onDismissPay?: () => void
}) {
  return (
    <div
      className={cn(
        "relative isolate flex min-h-[560px] flex-col overflow-hidden bg-zinc-950",
        "h-[min(88dvh,860px)]",
        "lg:h-[min(82dvh,900px)] lg:flex-row lg:rounded-3xl lg:border lg:border-border",
      )}
    >
      <div
        className={cn(
          "relative min-h-0 flex-none overflow-hidden",
          paying ? "h-[28%] lg:h-auto" : "h-[64%] lg:h-auto",
          "transition-all duration-300 ease-in-out",
          "lg:w-[68%] lg:flex-none",
        )}
      >
        {map}
        <button
          type="button"
          tabIndex={paying ? 0 : -1}
          aria-label="Volver a la selección"
          onClick={onDismissPay}
          className={cn(
            "absolute inset-0 z-20 bg-black/40 transition-opacity duration-300 ease-in-out",
            paying
              ? "opacity-100"
              : "pointer-events-none opacity-0",
          )}
        />
      </div>

      <div
        className={cn(
          "relative z-30 flex min-h-0 flex-1 flex-col bg-background",
          "rounded-t-3xl shadow-[0_-16px_40px_rgba(0,0,0,0.28)]",
          "transition-all duration-300 ease-in-out",
          "lg:w-[32%] lg:rounded-none lg:shadow-none",
        )}
      >
        {panel}
      </div>
    </div>
  )
}
