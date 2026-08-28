"use client"

import { ChevronUp, LoaderCircle } from "lucide-react"
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
  const itemLabel = resolvedCount === 1 ? "ítem" : "ítems"

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
          "flex w-full flex-col",
          variant === "panel"
            ? "min-w-0"
            : "fixed inset-x-0 bottom-0 z-40 lg:hidden",
          "border-t border-white/10 bg-card/95 shadow-2xl backdrop-blur-xl",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}
      >
        <button
          type="button"
          disabled={!canShowSummary}
          onClick={() => setSummaryOpen(true)}
          className="flex w-full cursor-pointer items-center justify-center gap-1 bg-secondary/50 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>Ver desglose ({resolvedCount} {itemLabel})</span>
          <ChevronUp className="size-3.5 shrink-0" aria-hidden="true" />
        </button>

        <div className="w-full pt-3 px-4">
          <Button
            type={formId ? "submit" : "button"}
            form={formId}
            variant={skipOptional ? "outline" : "default"}
            disabled={pending || locked || (skipOptional ? disabled : !canContinue)}
            aria-busy={pending}
            onClick={formId ? undefined : handlePay}
            className={cn(
              tapFeedbackClass,
              "flex h-14 w-full flex-row items-center justify-between px-6 text-sm disabled:scale-100 disabled:opacity-70",
              skipOptional
                ? "rounded-xl border-white/20 text-foreground"
                : "rounded-xl bg-emerald-500 font-extrabold text-black hover:bg-emerald-400",
              !skipOptional && !canContinue && "cursor-not-allowed opacity-70",
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              {pending ? (
                <>
                  <LoaderCircle className="size-5 shrink-0 animate-spin" aria-hidden="true" />
                  {pendingLabel}
                </>
              ) : (
                ctaLabel
              )}
            </span>
            {showTotal ? (
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  totalBump && !skipOptional && "text-emerald-900",
                )}
              >
                {formatCartTotal(resolvedTotal)}
              </span>
            ) : null}
          </Button>
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
