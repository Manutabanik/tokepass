"use client"

import { ArrowRight, LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { cn, tapFeedbackClass } from "@/lib/utils"

export function CheckoutFloatingBar({
  pending = false,
  locked = false,
  hidden = false,
  disabled = false,
  actionLabel,
  showArrow = false,
  totalAmount,
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
  onPay: () => void
  variant?: "page" | "panel"
}) {
  const showTotal = typeof totalAmount === "number"
  const [totalBump, setTotalBump] = useState(false)
  const lastTotal = useRef(totalAmount)

  useEffect(() => {
    if (hidden || !showTotal || lastTotal.current === totalAmount) return
    lastTotal.current = totalAmount
    setTotalBump(true)
    const timer = window.setTimeout(() => setTotalBump(false), 280)
    return () => window.clearTimeout(timer)
  }, [hidden, showTotal, totalAmount])

  if (hidden) return null

  return (
    <div
      className={cn(
        "z-50 w-full shrink-0 border-t border-border/50 bg-background/90 p-4 backdrop-blur-md",
        variant === "panel"
          ? "fixed bottom-0 left-0 sm:sticky sm:inset-auto lg:px-8"
          : "fixed inset-x-0 bottom-0 shadow-xl",
        "pb-[max(1rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {showTotal ? (
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Total</p>
            <p
              className={cn(
                "text-lg font-black tabular-nums tracking-tight text-foreground transition-all",
                totalBump && "scale-105 text-primary",
              )}
            >
              {formatCurrency(totalAmount)}
            </p>
          </div>
        ) : null}
        <Button
          type="button"
          disabled={pending || locked || disabled}
          onClick={onPay}
          className={cn(
            tapFeedbackClass,
            "h-auto rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground hover:bg-primary/90",
            showTotal ? "min-w-[44%] px-5" : "w-full py-6 text-lg",
            disabled && "cursor-not-allowed opacity-50",
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
