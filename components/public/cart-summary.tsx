"use client"

import { Trash2, X } from "lucide-react"

import {
  CART_TICKET_LINE_PREFIX,
  cartTicketLineId,
  parseCartTicketLineId,
} from "@/lib/checkout/cart-lines"
import { formatCurrency } from "@/lib/format"
import {
  useCheckoutStore,
  type StorefrontCartLine,
} from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

export { CART_TICKET_LINE_PREFIX, cartTicketLineId, parseCartTicketLineId }

export function CartSummary({
  items,
  className,
  heading = "Tu Selección",
  showClear = true,
}: {
  items: StorefrontCartLine[]
  className?: string
  heading?: string
  showClear?: boolean
}) {
  const removeItem = useCheckoutStore((state) => state.removeItem)
  const clearCart = useCheckoutStore((state) => state.clearCart)

  if (items.length === 0) return null

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-foreground">{heading}</h4>
        {showClear ? (
          <button
            type="button"
            onClick={clearCart}
            className={cn(
              tapFeedbackClass,
              "inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline",
            )}
          >
            <Trash2 className="size-3" aria-hidden="true" />
            Vaciar
          </button>
        ) : null}
      </div>
      <ul className="no-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {item.name}
              </p>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Válido para: {item.dateLabel || "Todos los días"}
              </span>
              {item.detail ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.detail}
                </p>
              ) : item.quantity > 1 ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.quantity} unidades
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatCurrency(item.price)}
              </span>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className={cn(
                  tapFeedbackClass,
                  "grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                )}
                aria-label={`Quitar ${item.name}`}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
