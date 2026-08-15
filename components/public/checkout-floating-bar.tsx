"use client"

import { ArrowRight, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CheckoutFloatingBar({
  pending = false,
  locked = false,
  hidden = false,
  disabled = false,
  actionLabel,
  showArrow = false,
  onPay,
  variant = "page",
}: {
  pending?: boolean
  locked?: boolean
  hidden?: boolean
  disabled?: boolean
  actionLabel: string
  showArrow?: boolean
  onPay: () => void
  variant?: "page" | "panel"
}) {
  if (hidden) return null

  return (
    <div
      className={cn(
        "z-30 w-full shrink-0 border-t border-border",
        variant === "panel"
          ? "mt-auto bg-background/95 p-4 backdrop-blur"
          : "fixed inset-x-0 bottom-0 bg-background p-4 shadow-xl",
        variant === "page" && "pb-[max(1rem,env(safe-area-inset-bottom))]",
        variant === "panel" && "pb-[max(1rem,env(safe-area-inset-bottom))]",
      )}
    >
      <Button
        type="button"
        disabled={pending || locked || disabled}
        onClick={onPay}
        className="min-h-11 h-12 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
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
  )
}
