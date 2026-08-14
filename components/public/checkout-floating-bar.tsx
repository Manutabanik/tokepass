"use client"

import { ArrowRight, ShoppingBag, Ticket } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { useActiveCheckoutSelection } from "@/lib/stores/checkout-intent-store"
import { cn } from "@/lib/utils"

export function CheckoutFloatingBar({
  eventId,
  preferLive = true,
  startingPrice,
  itemCount,
  subtotal,
  pending = false,
  locked = false,
  hidden = false,
  onChooseTickets,
  onPay,
}: {
  eventId: string
  preferLive?: boolean
  startingPrice: number | null
  itemCount: number
  subtotal: number
  pending?: boolean
  locked?: boolean
  hidden?: boolean
  onChooseTickets: () => void
  onPay: () => void
}) {
  const stored = useActiveCheckoutSelection(eventId)
  const resolvedCount = preferLive ? itemCount : Math.max(itemCount, stored.itemCount)
  const resolvedSubtotal = preferLive
    ? subtotal
    : itemCount > 0
      ? subtotal
      : stored.subtotal
  const active = resolvedCount > 0
  const fromLabel =
    startingPrice == null
      ? "—"
      : startingPrice === 0
        ? "Gratis"
        : formatCurrency(startingPrice)

  return (
    <div
      className={cn(
        "fixed inset-x-3 z-40 rounded-2xl border border-border bg-background/95 px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-md lg:hidden",
        "bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
        "transition-transform duration-200",
        hidden ? "pointer-events-none translate-y-[140%]" : "translate-y-0",
      )}
      aria-hidden={hidden}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {active ? "Subtotal" : "Desde"}
          </p>
          <p className="truncate text-lg font-black tabular-nums text-foreground">
            {active ? formatCurrency(resolvedSubtotal) : fromLabel}
          </p>
          {active ? (
            <p className="text-xs text-muted-foreground">
              {resolvedCount} {resolvedCount === 1 ? "ítem" : "ítems"}
            </p>
          ) : null}
        </div>
        {active ? (
          <Button
            type="button"
            disabled={pending || locked}
            onClick={onPay}
            className="h-12 min-w-[48px] shrink-0 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-zinc-950 hover:bg-emerald-400"
          >
            <ShoppingBag className="size-4" aria-hidden="true" />
            Pagar
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={locked}
            onClick={onChooseTickets}
            className="h-12 min-w-[48px] shrink-0 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-zinc-950 hover:bg-emerald-400"
          >
            <Ticket className="size-4" aria-hidden="true" />
            Elegir entradas
          </Button>
        )}
      </div>
    </div>
  )
}
