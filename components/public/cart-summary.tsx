"use client"

import { Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { QuantityCounter } from "@/components/public/quantity-counter"
import { Badge } from "@/components/ui/badge"
import { ABSOLUTE_MAX_ITEMS_PER_PURCHASE, storefrontLimitMessage } from "@/lib/checkout-limits"
import {
  generalLineTierId,
  isMapCartLine,
} from "@/lib/checkout/cart-item-identity"
import { cartItemScheduleId } from "@/lib/checkout/cart-line-stamp"
import { cartLineChargeAmount } from "@/lib/checkout/cart"
import {
  CART_TICKET_LINE_PREFIX,
  cartLineOfferTitle,
  cartLinePlaceBadge,
  cartLineUnitPrice,
  cartTicketLineId,
  parseCartTicketLineId,
} from "@/lib/checkout/cart-lines"
import {
  CartTotalAmount,
  CartTotalLabel,
} from "@/components/public/cart-total-transparency"
import { formatCartTotal } from "@/lib/format"
import {
  useCartPriceBreakdown,
  useCartServiceFeeRule,
  useCheckoutStore,
  type StorefrontCartLine,
} from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

export { CART_TICKET_LINE_PREFIX, cartTicketLineId, parseCartTicketLineId }

function setSmartCartGeneralQuantity(item: StorefrontCartLine, quantity: number) {
  const ticketTierId = generalLineTierId(item)
  if (!ticketTierId) return
  const result = useCheckoutStore.getState().setGeneralQuantity({
    ticketTierId,
    name: item.name,
    price: cartLineUnitPrice(item),
    quantity,
    maxQuantity: ABSOLUTE_MAX_ITEMS_PER_PURCHASE,
    scheduleId: cartItemScheduleId(item),
    dateString: item.dateString ?? item.dateLabel ?? null,
    sectorName: item.sectorName,
  })
  if (!result.ok) toast.error(storefrontLimitMessage(result.reason))
}

function SmartCartRow({
  item,
  compact,
}: {
  item: StorefrontCartLine
  compact: boolean
}) {
  const removeItem = useCheckoutStore((state) => state.removeItem)
  const title = cartLineOfferTitle(item)
  const feeRule = useCartServiceFeeRule()
  const amount = formatCartTotal(
    cartLineChargeAmount(
      {
        price: cartLineUnitPrice(item),
        quantity: item.quantity,
        finalPrice: item.finalPrice,
        customerTotal: item.customerTotal,
        totalPrice: item.totalPrice,
      },
      feeRule,
    ),
  )
  const mapRow = isMapCartLine(item)
  const badge = cartLinePlaceBadge(item) || "Mapa"

  return (
    <li
      className={
        compact
          ? "flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
          : "flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3"
      }
    >
      <div className="flex min-w-0 items-center gap-2">
        {mapRow ? (
          <Badge
            variant="secondary"
            className="max-w-[7.5rem] truncate rounded-md px-1.5 font-semibold"
          >
            {badge}
          </Badge>
        ) : (
          <QuantityCounter
            compact
            quantity={item.quantity}
            min={0}
            max={ABSOLUTE_MAX_ITEMS_PER_PURCHASE}
            decreaseLabel={`Quitar ${title}`}
            increaseLabel={`Agregar ${title}`}
            onDecrease={() =>
              setSmartCartGeneralQuantity(item, item.quantity - 1)
            }
            onIncrease={() =>
              setSmartCartGeneralQuantity(item, item.quantity + 1)
            }
          />
        )}
        <p
          className={cn(
            "min-w-0 truncate text-foreground",
            compact ? "text-xs font-medium" : "text-sm font-semibold",
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
}

export function CartServiceFeeRows({
  compact = false,
  showTotal = true,
}: {
  compact?: boolean
  showTotal?: boolean
}) {
  const { grandTotal } = useCartPriceBreakdown()
  if (!showTotal) return null

  return (
    <div
      className={cn(
        "shrink-0 border-t border-border",
        compact ? "mt-2 pt-2" : "mt-3 pt-3",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 font-bold text-foreground",
          compact ? "text-sm" : "text-base",
        )}
      >
        <CartTotalLabel />
        <CartTotalAmount amount={grandTotal} />
      </div>
    </div>
  )
}

export function CartSummary({
  className,
  heading = "Tu Selección",
  showClear = true,
  compact = false,
  showGrandTotal = true,
}: {
  items: StorefrontCartLine[]
  className?: string
  heading?: string
  showClear?: boolean
  compact?: boolean
  showGrandTotal?: boolean
}) {
  const liveLines = useCheckoutStore((state) => state.lines)
  const rows = liveLines
  const clearCart = useCheckoutStore((state) => state.clearCart)

  if (rows.length === 0) return null

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {heading || showClear ? (
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
      ) : null}
      <ul
        className={cn(
          "flex min-h-0 flex-col",
          compact
            ? "min-h-0 flex-1 gap-0 overflow-y-auto pr-2"
            : "no-scrollbar gap-2 overflow-y-auto",
        )}
      >
        {rows.map((item) => (
          <SmartCartRow
            key={item.ticketTierId ? `${item.ticketTierId}:${item.id}` : item.id}
            item={item}
            compact={compact}
          />
        ))}
      </ul>
      <CartServiceFeeRows compact={compact} showTotal={showGrandTotal} />
    </div>
  )
}
