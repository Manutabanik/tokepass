"use client"

import { ArrowLeft } from "lucide-react"

import { CheckoutHoldClock } from "@/components/checkout/CheckoutTimer"
import {
  CheckoutStepper,
  checkoutStepMeta,
  type CheckoutFlowStep,
} from "@/components/public/checkout-stepper"
import { cn } from "@/lib/utils"

export function CheckoutHeader({
  step,
  holdExpiresAt = null,
  maxTicketsPerUser = null,
  onBack,
  backLabel,
}: {
  step: CheckoutFlowStep
  holdExpiresAt?: string | null
  maxTicketsPerUser?: number | null
  onBack: () => void
  backLabel: string
}) {
  const showLimit = step === "tickets" && (maxTicketsPerUser ?? 0) > 0 && !holdExpiresAt
  const meta = checkoutStepMeta(step)
  const timer = holdExpiresAt ? (
    <CheckoutHoldClock expiresAt={holdExpiresAt} />
  ) : null

  return (
    <header className="sticky top-0 z-40 w-full flex-none border-b border-border/50 bg-background/95 backdrop-blur-xl">
      {/* Vista Mobile con padding de Safe Area para no cortarse con el notch/navegador */}
      <div className="flex min-h-14 h-auto w-full items-center justify-between gap-2 px-3.5 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] pb-2.5 md:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground transition-all active:scale-95 shrink-0"
        >
          <ArrowLeft className="size-4 text-primary" aria-hidden="true" />
          <span>Volver</span>
        </button>

        <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-secondary px-3 py-1 shrink-0">
          <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
          <span className="text-[11px] font-bold tracking-wider text-secondary-foreground uppercase">
            {meta.stepNumber}. {meta.label}
          </span>
        </div>

        <div className="flex min-w-10 justify-end shrink-0">
          {timer ?? (
            <span
              className={cn(
                "text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap",
                !showLimit && "invisible",
              )}
            >
              {showLimit ? `Máx. ${maxTicketsPerUser}` : "—"}
            </span>
          )}
        </div>
      </div>

      {/* Vista Desktop (Intacta) */}
      <div className="mx-auto hidden h-16 max-w-7xl items-center justify-between gap-4 px-4 py-3 md:flex md:h-20 md:px-8">
        <div className="flex min-w-0 flex-1 justify-start">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-secondary px-3.5 py-2 text-sm font-bold text-secondary-foreground shadow-sm transition-all hover:scale-105 hover:bg-secondary/80 active:scale-95"
          >
            <ArrowLeft className="size-4 text-primary" aria-hidden="true" />
            <span className="truncate">{backLabel}</span>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <CheckoutStepper step={step} compact />
        </div>

        <div className="flex min-w-0 flex-1 justify-end">
          {timer ?? (
            <span
              className={cn(
                "inline-flex rounded-full border border-border/40 bg-secondary/40 px-3 py-1 text-[11px] font-semibold text-muted-foreground",
                !showLimit && "invisible",
              )}
            >
              {showLimit ? `Máx. ${maxTicketsPerUser} lugares` : "—"}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
