"use client"

import { Clock } from "lucide-react"

import { CountdownTimer } from "@/components/public/countdown-timer"
import { GA_CHECKOUT_HOLD_MINUTES } from "@/lib/checkout-hold"

export function ReservationTimerBar({
  expiresAt,
  onExpire,
}: {
  expiresAt: string
  onExpire: () => void
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex min-w-0 items-center justify-center gap-2 bg-primary px-4 py-2 text-primary-foreground shadow-md"
    >
      <Clock className="size-4 shrink-0 animate-pulse" aria-hidden="true" />
      <span className="min-w-0 break-words text-center text-sm font-bold tracking-wide whitespace-normal">
        Tus lugares están reservados por{" "}
        <CountdownTimer
          expiresAt={expiresAt}
          initialMinutes={GA_CHECKOUT_HOLD_MINUTES}
          onExpire={onExpire}
        />
      </span>
    </div>
  )
}
