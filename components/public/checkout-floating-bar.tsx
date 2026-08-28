"use client"

import { ArrowRight, ChevronUp, LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { CheckoutCartBottomSheet } from "@/components/checkout/checkout-cart-bottom-sheet"
import { Button } from "@/components/ui/button"
import {
  sumCartQuantities,
  toCartNumber,
} from "@/lib/checkout/cart"
import { formatCartTotal } from "@/lib/format"
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
                {formatCartTotal(resolvedTotal)}
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

      <CheckoutCartBottomSheet
        open={isSummaryOpen}
        onOpenChange={setSummaryOpen}
        totalAmount={resolvedTotal}
        formId={formId}
        onContinue={formId ? undefined : handleContinueFromSummary}
        continueLabel={ctaLabel}
        continuePending={pending}
        continueDisabled={locked || !canContinue}
        continuePendingLabel={pendingLabel}
        continueVariant={skipOptional ? "outline" : "default"}
        showContinueArrow={ctaShowArrow}
        onEditMap={onEditMap ? handleEditMap : undefined}
      />
    </>
  )
}
