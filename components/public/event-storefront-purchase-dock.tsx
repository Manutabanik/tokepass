"use client"

import { formatTicketPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

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
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur lg:hidden",
        "pb-[max(1rem,env(safe-area-inset-bottom))]",
        !isAvailable && "opacity-80",
      )}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="min-w-0">
          {isAvailable ? (
            <>
              <span className="mb-0.5 block text-[10px] font-extrabold tracking-wider text-muted-foreground uppercase">
                Entradas desde
              </span>
              <span className="block truncate text-xl font-black tracking-tight text-primary tabular-nums">
                {price != null ? formatTicketPrice(price) : "—"}
              </span>
            </>
          ) : (
            <>
              <span className="mb-0.5 block text-[10px] font-extrabold tracking-wider text-muted-foreground uppercase">
                Estado
              </span>
              <span className="block text-lg font-black tracking-tight text-muted-foreground">
                Agotado
              </span>
            </>
          )}
        </div>
        {isAvailable ? (
          <button
            type="button"
            onClick={onAcquire}
            className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl bg-primary px-3 text-sm font-black text-primary-foreground shadow-[0_0_20px] shadow-primary/30 transition-all hover:brightness-110 active:scale-95"
          >
            Adquirir Entradas
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="pointer-events-none min-h-[44px] w-full min-w-0 flex-1 cursor-not-allowed rounded-xl bg-secondary/50 px-3 text-sm font-bold text-muted-foreground"
          >
            Sin stock
          </button>
        )}
      </div>
    </div>
  )
}
