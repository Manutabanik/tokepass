"use client"

import { formatCurrency } from "@/lib/format"
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
        "fixed right-4 bottom-4 left-4 z-50 mx-auto flex max-w-md items-center justify-between rounded-2xl border border-border/40 bg-background/95 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-all duration-300 lg:hidden dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]",
        !isAvailable && "opacity-80",
      )}
    >
      <div className="min-w-0">
        {isAvailable ? (
          <>
            <span className="mb-0.5 block text-[10px] font-extrabold tracking-wider text-muted-foreground uppercase">
              Entradas desde
            </span>
            <span className="block truncate text-xl font-black tracking-tight text-primary tabular-nums">
              {price != null ? formatCurrency(price) : "—"}
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
          className="h-12 shrink-0 rounded-xl bg-primary px-7 text-sm font-black whitespace-nowrap text-primary-foreground shadow-[0_0_20px] shadow-primary/30 transition-all hover:brightness-110 active:scale-95"
        >
          Adquirir Entradas
        </button>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="pointer-events-none h-12 shrink-0 cursor-not-allowed rounded-xl bg-secondary/50 px-7 text-sm font-bold whitespace-nowrap text-muted-foreground"
        >
          Sin stock
        </button>
      )}
    </div>
  )
}
