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
import { formatCurrency } from "@/lib/format"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

export function CheckoutFloatingBar({
  pending = false,
  locked = false,
  hidden = false,
  disabled = false,
  actionLabel,
  pendingLabel = "Procesando",
  showArrow = false,
  totalAmount,
  itemsCount,
  onPay,
  onEditMap,
  pulseCta = false,
  prominentCta = false,
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
  onPay: () => void
  onEditMap?: () => void
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
  const canShowSummary = resolvedCount > 0 && cartLines.length > 0
  const [summaryOpen, setSummaryOpen] = useState(false)
  const isSummaryOpen = canShowSummary && summaryOpen
  const lastTotal = useRef(resolvedTotal)
  const canContinue = (resolvedTotal > 0 || resolvedCount > 0) && !disabled

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
          "fixed right-4 bottom-4 left-4 z-50 flex items-center justify-between rounded-2xl border border-border/50 bg-background/95 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-all duration-300 lg:hidden dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]",
        )}
      >
        <div
          className={cn(
            "flex w-full items-center justify-between gap-3",
            prominentCta && "lg:flex-col lg:gap-4",
          )}
        >
          {showTotal ? (
            <button
              type="button"
              disabled={resolvedCount === 0}
              onClick={() => setSummaryOpen(true)}
              className="flex min-w-0 cursor-pointer flex-col text-left disabled:cursor-default lg:pointer-events-none"
            >
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
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
                  "text-xl font-black tabular-nums tracking-tight text-foreground transition-all lg:text-2xl",
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
            aria-busy={pending}
            onClick={handlePay}
            className={cn(
              tapFeedbackClass,
              "h-14 min-w-0 shrink-0 rounded-2xl bg-primary px-6 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 md:h-16",
              prominentCta && "lg:w-full",
              !canContinue && "cursor-not-allowed opacity-50",
              pulseCta && canContinue && "animate-pulse",
            )}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {pendingLabel}
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

      <Sheet open={isSummaryOpen} onOpenChange={setSummaryOpen}>
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
                  onClick={() => setSummaryOpen(false)}
                  className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Cerrar"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            {onEditMap ? (
              <button
                type="button"
                onClick={handleEditMap}
                className="mt-1 flex min-h-11 items-center gap-2 py-2 text-sm font-medium text-primary transition-all duration-200 hover:text-primary/80"
              >
                <Map className="size-4" aria-hidden="true" />
                Editar en mapa
              </button>
            ) : null}
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
              aria-busy={pending}
              onClick={handleContinueFromSummary}
              className={cn(
                tapFeedbackClass,
                "h-auto w-full rounded-2xl bg-primary py-3.5 text-base font-bold text-primary-foreground hover:bg-primary/90",
              )}
            >
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  {pendingLabel}
                </>
              ) : (
                "Continuar a pago"
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
