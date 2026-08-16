"use client"

import { ArrowRight, ChevronUp, LoaderCircle, Trash2, X } from "lucide-react"
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
import { formatCurrency } from "@/lib/format"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

export function CheckoutFloatingBar({
  pending = false,
  locked = false,
  hidden = false,
  disabled = false,
  actionLabel,
  showArrow = false,
  totalAmount,
  itemsCount,
  onPay,
  variant = "page",
  pulseCta = false,
  prominentCta = false,
}: {
  pending?: boolean
  locked?: boolean
  hidden?: boolean
  disabled?: boolean
  actionLabel: string
  showArrow?: boolean
  totalAmount?: number | null
  itemsCount?: number
  onPay: () => void
  variant?: "page" | "panel"
  pulseCta?: boolean
  prominentCta?: boolean
}) {
  const cartTotal = useCheckoutStore((state) => state.totalAmount)
  const cartCount = useCheckoutStore((state) => state.itemsCount)
  const cartLines = useCheckoutStore((state) => state.lines)
  const clearCart = useCheckoutStore((state) => state.clearCart)
  const passedTotal = typeof totalAmount === "number" ? totalAmount : 0
  const resolvedTotal = Math.max(cartTotal, passedTotal)
  const resolvedCount = Math.max(cartCount, itemsCount ?? 0)
  const showTotal = resolvedTotal > 0 || resolvedCount > 0 || passedTotal >= 0
  const [totalBump, setTotalBump] = useState(false)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)
  const lastTotal = useRef(resolvedTotal)
  const canContinue = (resolvedTotal > 0 || resolvedCount > 0) && !disabled

  useEffect(() => {
    if (hidden || !showTotal || lastTotal.current === resolvedTotal) return
    lastTotal.current = resolvedTotal
    setTotalBump(true)
    const timer = window.setTimeout(() => setTotalBump(false), 280)
    return () => window.clearTimeout(timer)
  }, [hidden, resolvedTotal, showTotal])

  useEffect(() => {
    if (resolvedCount === 0 || cartLines.length === 0) {
      setIsSummaryOpen(false)
    }
  }, [cartLines.length, resolvedCount])

  if (hidden) return null

  function handleContinueFromSummary() {
    setIsSummaryOpen(false)
    onPay()
  }

  return (
    <>
      <div
        className={cn(
          "w-full shrink-0 border-t backdrop-blur-xl",
          variant === "panel"
            ? "fixed inset-x-0 bottom-0 z-[90] border-t border-border/50 bg-slate-900/95 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] lg:static lg:inset-auto lg:bottom-auto lg:z-50 lg:border-border/40 lg:bg-card/95 lg:px-8 lg:py-4 lg:pb-4 lg:shadow-none lg:backdrop-blur-md"
            : "fixed inset-x-0 bottom-0 z-50 border-border/50 bg-background/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl lg:pb-4",
        )}
      >
        <div
          className={cn(
            "flex gap-4",
            prominentCta ? "flex-col" : "items-center justify-between",
          )}
        >
          {showTotal ? (
            <button
              type="button"
              disabled={resolvedCount === 0}
              onClick={() => setIsSummaryOpen(true)}
              className="flex min-w-0 cursor-pointer flex-col text-left disabled:cursor-default lg:pointer-events-none"
            >
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground max-lg:text-zinc-200">
                {resolvedCount > 0
                  ? `${resolvedCount} ${resolvedCount === 1 ? "seleccionado" : "seleccionados"}`
                  : "Total"}
                {resolvedCount > 0 ? (
                  <ChevronUp
                    className="size-3 lg:hidden"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span
                className={cn(
                  "text-xl font-black tabular-nums tracking-tight text-foreground transition-all max-lg:text-white lg:text-2xl",
                  totalBump && "scale-105 text-primary",
                )}
              >
                {formatCurrency(resolvedTotal)}
              </span>
            </button>
          ) : null}
          <Button
            type="button"
            disabled={pending || locked || !canContinue}
            onClick={onPay}
            className={cn(
              tapFeedbackClass,
              "rounded-2xl bg-primary px-6 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90",
              showTotal && !prominentCta
                ? "h-14 min-w-0 md:h-16"
                : "h-14 w-full md:h-16",
              prominentCta && "h-14 w-full text-lg font-bold md:h-16",
              !canContinue && "cursor-not-allowed opacity-50",
              pulseCta && canContinue && "animate-pulse",
            )}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Preparando pago
              </>
            ) : (
              <>
                {actionLabel}
                {showArrow ? (
                  <ArrowRight className="size-4" aria-hidden="true" />
                ) : null}
              </>
            )}
          </Button>
        </div>
      </div>

      <Sheet open={isSummaryOpen} onOpenChange={setIsSummaryOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          overlayClassName="z-[100] lg:hidden"
          className="z-[100] max-h-[60dvh] gap-0 overflow-hidden p-0 lg:hidden"
        >
          <SheetHeader className="flex-none border-b border-border px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="text-base font-bold">
                  Detalle de tu compra
                </SheetTitle>
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
                      "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-destructive hover:underline",
                    )}
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                    Vaciar todo
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsSummaryOpen(false)}
                  className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Cerrar"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </SheetHeader>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <CartSummary items={cartLines} heading="Ítems" showClear={false} />
          </div>
          <div className="flex-none border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                Total
              </span>
              <span className="text-lg font-black tabular-nums text-foreground">
                {formatCurrency(resolvedTotal)}
              </span>
            </div>
            <Button
              type="button"
              disabled={pending || locked || !canContinue}
              onClick={handleContinueFromSummary}
              className={cn(
                tapFeedbackClass,
                "h-auto w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white hover:bg-emerald-500",
              )}
            >
              Continuar a pago
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
