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
import { formatTicketPrice } from "@/lib/format"
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
      {/* Barra Flotante Inferior Mobile */}
      <div
        className={cn(
          "fixed right-0 bottom-0 left-0 z-50 flex items-center justify-between border-t border-gray-200 bg-white p-4 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] lg:hidden dark:border-border dark:bg-card dark:shadow-[0_-10px_24px_-6px_rgba(0,0,0,0.45)]",
          "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
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
              className="flex min-w-0 cursor-pointer flex-col pl-1 text-left disabled:cursor-default lg:pointer-events-none"
            >
              <span className="flex items-center gap-1 text-[11px] font-medium text-gray-600 dark:text-muted-foreground">
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
                  "text-lg font-black tracking-tight text-gray-900 tabular-nums transition-all md:text-xl lg:text-2xl dark:text-foreground",
                  totalBump && "scale-105 text-primary",
                )}
              >
                {formatTicketPrice(resolvedTotal)}
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
              "h-12 min-w-0 shrink-0 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 md:h-14",
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

      {/* Sheet / Drawer Modal del Carrito Compacto */}
      <Sheet open={isSummaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          overlayClassName="z-[100] lg:hidden"
          className="z-[100] max-h-[38dvh] gap-0 overflow-hidden rounded-t-2xl p-0 lg:hidden"
        >
          {/* Header del Drawer */}
          <SheetHeader className="flex-none border-b border-border/60 px-3.5 py-2 text-left">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <SheetTitle className="truncate text-sm font-bold text-foreground">
                  Detalle de tu compra
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
                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Cerrar"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </SheetHeader>

          {/* Lista de ítems hiper compacta */}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3.5 py-1.5">
            <CartSummary
              items={cartLines}
              heading=""
              showClear={false}
              compact
            />
          </div>

          {/* Footer del Drawer con Total y Continuar */}
          <div className="flex-none border-t border-border/60 px-3.5 pt-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                Total
              </span>
              <span className="text-base font-black tabular-nums text-foreground">
                {formatTicketPrice(resolvedTotal)}
              </span>
            </div>
            <Button
              type="button"
              disabled={pending || locked || !canContinue}
              aria-busy={pending}
              onClick={handleContinueFromSummary}
              className={cn(
                tapFeedbackClass,
                "h-11 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90",
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
