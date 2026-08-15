"use client"

import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export function CheckoutFloatingBar({
  itemCount,
  subtotal,
  pending = false,
  locked = false,
  hidden = false,
  onPay,
  variant = "page",
}: {
  itemCount: number
  subtotal: number
  pending?: boolean
  locked?: boolean
  hidden?: boolean
  onPay: () => void
  variant?: "page" | "panel"
}) {
  const visible = itemCount > 0 && !hidden

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out",
        variant === "panel"
          ? "sticky bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur-md"
          : "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background px-4 pt-3 shadow-xl",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0",
      )}
      aria-hidden={!visible}
    >
      <Button
        type="button"
        disabled={pending || locked || !visible}
        onClick={onPay}
        className="h-12 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Preparando pago
          </>
        ) : (
          `Pagar ${formatCurrency(subtotal)}`
        )}
      </Button>
    </div>
  )
}
