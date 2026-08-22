"use client"

import { ArrowRight, ChevronUp, LoaderCircle, Map, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { CartSummary } from "@/components/public/cart-summary"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  sumCartAmounts,
  sumCartQuantities,
  toCartNumber,
} from "@/lib/checkout/cart"
import { formatTicketPrice } from "@/lib/format"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

export function CheckoutFloatingBar({
  pending = false,
  locked = false,
  hidden = false,
  disabled = false,
  actionLabel,
  pendingLabel = "Procesando pago...",
  showArrow = false,
  totalAmount,
  itemsCount,
  onPay,
  onEditMap,
  prominentCta = false,
  optionalStep = false,
  hasAddedItems = false,
  variant = "page",
  formId,
}: {
  pending?: boolean
  locked?: boolean
  hidden?: boolean
  disabled?: boolean
  actionLabel: string
  pendingLabel?: string
  showArrow?: boolean
  totalAmount?: number | null
  itemsCount?: number
  formId?: string
  onPay: () => void
  onEditMap?: () => void
  variant?: "page" | "panel"
  pulseCta?: boolean
  prominentCta?: boolean
  optionalStep?: boolean
  hasAddedItems?: boolean
}) {
  const cartTotal = useCheckoutStore((state) => state.totalAmount)
  const cartCount = useCheckoutStore((state) => state.itemsCount)
  const cartLines = useCheckoutStore((state) => state.lines)
  const clearCart = useCheckoutStore((state) => state.clearCart)
  const linesSubtotal = sumCartAmounts(cartLines)
  const lineCount = sumCartQuantities(cartLines)
  const passedTotal =
    typeof totalAmount === "number" ? toCartNumber(totalAmount) : null
  const resolvedTotal =
    passedTotal != null ? passedTotal : toCartNumber(cartTotal)
  const resolvedCount =
    lineCount > 0
      ? lineCount
      : Math.max(toCartNumber(cartCount), toCartNumber(itemsCount ?? 0))
  const showTotal = resolvedTotal > 0 || resolvedCount > 0 || passedTotal != null
  const [totalBump, setTotalBump] = useState(false)
  const canShowSummary = resolvedCount > 0 && cartLines.length > 0
  const [summaryOpen, setSummaryOpen] = useState(false)
  const isSummaryOpen = canShowSummary && summaryOpen
  const lastTotal = useRef(resolvedTotal)
  const canContinue = !disabled && (optionalStep || resolvedCount > 0)
  const skipOptional = optionalStep && !hasAddedItems
  const ctaLabel = skipOptional
    ? "Omitir paso"
    : optionalStep
      ? "Continuar"
      : actionLabel
  const ctaShowArrow = skipOptional ? false : optionalStep || showArrow
  const extraCharges = resolvedTotal - linesSubtotal
  const showChargeSplit = cartLines.length > 0 && extraCharges > 0.009

  useEffect(() => {
    if (hidden || !showTotal || lastTotal.current === resolvedTotal) return
    lastTotal.current = resolvedTotal
    setTotalBump(true)
    const timer = window.setTimeout(() => setTotalBump(false), 280)
    return () => window.clearTimeout(timer)
  }, [hidden, resolvedTotal, showTotal])

  if (hidden) return null

  function handlePay() {
    if (pending || locked || !canContinue) return
    onPay()
  }

  function handleContinueFromSummary() {
    if (pending || locked || !canContinue) return
    setSummaryOpen(false)
    onPay()
  }

  function handleEditMap() {
    if (!onEditMap) return
    setSummaryOpen(false)
    window.setTimeout(() => onEditMap(), 180)
  }

  return (
    <>
      <div
        className={cn(
          variant === "panel"
            ? "w-full min-w-0"
            : "fixed right-0 bottom-0 left-0 z-40 lg:hidden",
          variant === "panel"
            ? null
            : "border-t border-white/10 bg-card/95 p-4 shadow-2xl backdrop-blur-xl",
          variant === "panel"
            ? null
            : "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            prominentCta && "lg:flex-col lg:gap-4",
          )}
        >
          {showTotal ? (
            <div className="min-w-0 flex-1 overflow-hidden pr-2">
              <span
                className={cn(
                  "block truncate whitespace-nowrap text-xl font-black tracking-tight text-foreground tabular-nums",
                  totalBump && "text-emerald-400",
                )}
              >
                {formatTicketPrice(resolvedTotal)}
              </span>
              <button
                type="button"
                disabled={!canShowSummary}
                onClick={() => setSummaryOpen(true)}
                className="mt-0.5 flex max-w-full min-w-0 items-center gap-1 text-xs font-semibold text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                <span className="truncate whitespace-nowrap">
                  {resolvedCount}{" "}
                  {resolvedCount === 1 ? "ítem" : "ítems"} (Ver detalle)
                </span>
                <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {skipOptional ? (
            <Button
              type={formId ? "submit" : "button"}
              form={formId}
              variant="outline"
              disabled={pending || locked || disabled}
              aria-busy={pending}
              onClick={formId ? undefined : handlePay}
              className={cn(
                tapFeedbackClass,
                "h-12 shrink-0 rounded-xl border-white/20 px-5 text-sm text-foreground",
                prominentCta && "lg:w-full",
              )}
            >
              {pending ? pendingLabel : ctaLabel}
            </Button>
          ) : (
            <Button
              type={formId ? "submit" : "button"}
              form={formId}
              disabled={pending || locked || !canContinue}
              aria-busy={pending}
              onClick={formId ? undefined : handlePay}
              className={cn(
                tapFeedbackClass,
                "flex h-12 shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-6 text-sm font-extrabold whitespace-nowrap text-black hover:bg-emerald-400 disabled:scale-100 disabled:opacity-70",
                prominentCta && "lg:w-full",
                !canContinue && "cursor-not-allowed opacity-70",
              )}
            >
              {pending ? (
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                  {pendingLabel}
                </span>
              ) : (
                <>
                  {ctaLabel}
                  {ctaShowArrow ? (
                    <ArrowRight className="size-4" aria-hidden="true" />
                  ) : null}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <Sheet open={isSummaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          overlayClassName="z-[100] lg:hidden"
          className="z-[100] max-h-[min(80dvh,100dvh)] gap-0 overflow-hidden rounded-t-3xl p-0 lg:hidden"
        >
          <SheetHeader className="flex-none border-b border-border/60 px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <SheetTitle className="truncate text-base font-bold text-foreground">
                  Resumen de tu compra
                </SheetTitle>
                {onEditMap ? (
                  <button
                    type="button"
                    onClick={handleEditMap}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20"
                  >
                    <Map className="size-3" aria-hidden="true" />
                    Ver en mapa
                  </button>
                ) : null}
                <SheetDescription className="sr-only">
                  Revisá, quitá o vaciá los ítems de tu carrito.
                </SheetDescription>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {cartLines.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearCart}
                    className={cn(
                      tapFeedbackClass,
                      "inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-destructive hover:underline",
                    )}
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                    Vaciar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSummaryOpen(false)}
                  className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Cerrar"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </SheetHeader>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2">
            <CartSummary
              items={cartLines}
              heading=""
              showClear={false}
              compact
            />
          </div>

          <div className="flex-none border-t border-border/60 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {showChargeSplit ? (
              <div className="mb-2 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">
                    {formatTicketPrice(linesSubtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span>Cargos y ajustes</span>
                  <span className="tabular-nums">
                    {formatTicketPrice(extraCharges)}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                Total
              </span>
              <span className="text-xl font-black whitespace-nowrap tabular-nums text-foreground">
                {formatTicketPrice(resolvedTotal)}
              </span>
            </div>
            <Button
              type={formId ? "submit" : "button"}
              form={formId}
              disabled={pending || locked || !canContinue}
              aria-busy={pending}
              onClick={() => {
                if (formId) {
                  setSummaryOpen(false)
                  return
                }
                handleContinueFromSummary()
              }}
              className={cn(
                tapFeedbackClass,
                skipOptional
                  ? "h-12 w-full rounded-xl border-white/20 text-sm text-foreground"
                  : "h-12 w-full rounded-xl bg-emerald-500 text-sm font-extrabold text-black hover:bg-emerald-400 disabled:scale-100 disabled:opacity-70",
              )}
              variant={skipOptional ? "outline" : "default"}
            >
              {pending ? (
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                  {pendingLabel}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {ctaLabel}
                  {ctaShowArrow ? (
                    <ArrowRight className="size-4" aria-hidden="true" />
                  ) : null}
                </span>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
