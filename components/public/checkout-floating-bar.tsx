"use client"

import { ArrowRight, ChevronUp, LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { useStorefrontCartStore } from "@/lib/stores/storefront-cart-store"
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
  detail = null,
  onPay,
  variant = "page",
}: {
  pending?: boolean
  locked?: boolean
  hidden?: boolean
  disabled?: boolean
  actionLabel: string
  showArrow?: boolean
  totalAmount?: number | null
  itemsCount?: number
  detail?: ReactNode
  onPay: () => void
  variant?: "page" | "panel"
}) {
  const cartTotal = useStorefrontCartStore((state) => state.totalAmount)
  const cartCount = useStorefrontCartStore((state) => state.itemsCount)
  const passedTotal = typeof totalAmount === "number" ? totalAmount : 0
  const resolvedTotal = Math.max(cartTotal, passedTotal)
  const resolvedCount = Math.max(cartCount, itemsCount ?? 0)
  const showTotal = resolvedTotal > 0 || resolvedCount > 0 || passedTotal >= 0
  const [totalBump, setTotalBump] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
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
    if (resolvedCount === 0) setDetailOpen(false)
  }, [resolvedCount])

  if (hidden) return null

  return (
    <div
      className={cn(
        "w-full shrink-0 border-t backdrop-blur-xl",
        variant === "panel"
          ? "fixed inset-x-0 z-[90] bg-slate-900/95 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] max-lg:bottom-[4.25rem] max-lg:border-border/50 max-lg:px-4 max-lg:py-3 lg:static lg:inset-auto lg:bottom-auto lg:z-50 lg:border-border/40 lg:bg-card/95 lg:px-8 lg:py-4 lg:shadow-none lg:backdrop-blur-md"
          : "fixed inset-x-0 bottom-0 z-50 border-border/50 bg-background/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl lg:pb-4",
      )}
    >
      {detail && detailOpen && resolvedCount > 0 ? (
        <div className="no-scrollbar mb-3 max-h-[40vh] overflow-y-auto rounded-xl bg-background p-2 lg:hidden">
          {detail}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        {showTotal ? (
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground max-lg:text-zinc-400">
              {resolvedCount > 0
                ? `${resolvedCount} ${resolvedCount === 1 ? "seleccionado" : "seleccionados"}`
                : "Total"}
            </p>
            <p
              className={cn(
                "text-2xl font-black tabular-nums tracking-tight text-foreground transition-all max-lg:text-white",
                totalBump && "scale-105 text-primary",
              )}
            >
              {formatCurrency(resolvedTotal)}
            </p>
            {detail && resolvedCount > 0 ? (
              <button
                type="button"
                onClick={() => setDetailOpen((open) => !open)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground max-lg:text-zinc-300 lg:hidden"
              >
                <ChevronUp
                  className={cn(
                    "size-3.5 transition-transform",
                    detailOpen ? "rotate-0" : "rotate-180",
                  )}
                  aria-hidden="true"
                />
                {detailOpen ? "Ocultar detalle" : "Ver detalle"}
              </button>
            ) : null}
          </div>
        ) : null}
        <Button
          type="button"
          disabled={pending || locked || !canContinue}
          onClick={onPay}
          className={cn(
            tapFeedbackClass,
            "h-auto rounded-2xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90",
            showTotal ? "min-w-[44%]" : "w-full py-6 text-lg",
            !canContinue && "cursor-not-allowed opacity-50",
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
  )
}
