"use client"

import { Trash2, X } from "lucide-react"

import {
  CART_TICKET_LINE_PREFIX,
  cartLineAmount,
  cartLineSnapshotLabel,
  cartLineUnitPrice,
  cartTicketLineId,
  parseCartTicketLineId,
} from "@/lib/checkout/cart-lines"
import { formatCartTotal } from "@/lib/format"
import {
  useCheckoutStore,
  type StorefrontCartLine,
} from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

export { CART_TICKET_LINE_PREFIX, cartTicketLineId, parseCartTicketLineId }

export function CartSummary({
  className,
  heading = "Tu Selección",
  showClear = true,
  compact = false,
}: {
  items: StorefrontCartLine[]
  className?: string
  heading?: string
  showClear?: boolean
  compact?: boolean
}) {
  const liveLines = useCheckoutStore((state) => state.lines)
  const rows = liveLines
  const removeItem = useCheckoutStore((state) => state.removeItem)
  const clearCart = useCheckoutStore((state) => state.clearCart)

  if (rows.length === 0) return null

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-3",
          compact ? "mb-1" : "mb-2",
        )}
      >
        {heading ? (
          <h4 className="text-sm font-bold text-foreground">{heading}</h4>
        ) : (
          <span />
        )}
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
      <ul
        className={cn(
          "flex min-h-0 flex-col",
          compact
            ? "min-h-0 flex-1 gap-0 overflow-y-auto pr-2"
            : "no-scrollbar gap-2 overflow-y-auto",
        )}
      >
        {rows.map((item) => {
          const title = cartLineSnapshotLabel({
            name: item.name,
            displayName: item.displayName,
            seatLabel: item.seatLabel,
            dateString: item.dateString,
          })
          const amount = formatCartTotal(
            cartLineAmount({
              price: cartLineUnitPrice(item),
              quantity: item.quantity,
            }),
          )
          const rowKey = item.ticketTierId
            ? `${item.ticketTierId}:${item.id}`
            : item.id

          return (
            <li
              key={rowKey}
              className={
                compact
                  ? "flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
                  : "flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3"
              }
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    "line-clamp-2 break-words text-foreground",
                    compact
                      ? "text-xs font-medium"
                      : "text-sm font-semibold",
                  )}
                >
                  {title}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={cn(
                    "tabular-nums",
                    compact
                      ? "text-xs font-semibold text-foreground"
                      : "text-sm font-bold text-foreground",
                  )}
                >
                  {amount}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className={cn(
                    tapFeedbackClass,
                    compact
                      ? "grid size-7 place-items-center rounded-md text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                      : "grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                  )}
                  aria-label={`Quitar ${title}`}
                >
                  {compact ? (
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  ) : (
                    <X className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
