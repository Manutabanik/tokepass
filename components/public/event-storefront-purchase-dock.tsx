"use client"

import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import { formatTicketPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

function subscribe() {
  return () => {}
}

function useHasDocument() {
  return useSyncExternalStore(
    subscribe,
    () => typeof document !== "undefined",
    () => false,
  )
}

type EventStorefrontPurchaseDockProps = {
  price: number | null
  isAvailable: boolean
  onAcquire: () => void
}

export function EventStorefrontPurchaseDock({
  price,
  isAvailable,
  onAcquire,
}: EventStorefrontPurchaseDockProps) {
  const hasDocument = useHasDocument()

  const dock = (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-[100] border-t border-black/5 bg-white/80 px-4 pt-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] backdrop-blur-2xl lg:hidden",
        "dark:border-white/10 dark:bg-[#09090b]/80 dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)]",
        "pb-[calc(1rem+env(safe-area-inset-bottom))]",
        !isAvailable && "opacity-80",
      )}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          {isAvailable ? (
            <>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total desde
              </span>
              <span className="block whitespace-nowrap text-xl font-black text-foreground tabular-nums md:text-2xl">
                {price != null ? formatTicketPrice(price) : "—"}
              </span>
            </>
          ) : (
            <>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Estado
              </span>
              <span className="block text-lg font-black tracking-tight text-muted-foreground">
                Agotado
              </span>
            </>
          )}
        </div>
        {isAvailable ? (
          <Button
            type="button"
            size="storefront"
            onClick={onAcquire}
            className="h-14 max-w-[200px] flex-1 rounded-xl bg-emerald-500 text-lg font-black text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-400"
          >
            Comprar
          </Button>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="pointer-events-none h-14 max-w-[200px] min-w-0 flex-1 cursor-not-allowed rounded-xl bg-muted px-3 text-lg font-bold text-muted-foreground"
          >
            Sin stock
          </button>
        )}
      </div>
    </div>
  )

  if (!hasDocument) return null
  return createPortal(dock, document.body)
}
