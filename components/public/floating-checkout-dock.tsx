"use client"

import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { formatTicketPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

type FloatingCheckoutDockProps = {
  price: number | null
  actionLabel?: string
  onAcquire: (event: React.MouseEvent) => void
}

export function FloatingCheckoutDock({
  price,
  actionLabel = "Elegir entradas",
  onAcquire,
}: FloatingCheckoutDockProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  if (!mounted) return null

  return createPortal(
    <div
      role="region"
      aria-label="Comprar entradas"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex lg:hidden",
        "border-t border-border/40 bg-background/95 px-4 py-3 shadow-2xl backdrop-blur-md",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Desde
          </p>
          <p className="truncate text-lg font-black tabular-nums text-foreground">
            {price != null ? formatTicketPrice(price) : "Consultar"}
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onAcquire(event)
          }}
          className="shrink-0 whitespace-nowrap rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-bold text-black hover:bg-emerald-400"
        >
          {actionLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
