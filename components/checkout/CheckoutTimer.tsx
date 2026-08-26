"use client"

import { useEffect, useRef } from "react"
import { Clock } from "lucide-react"

import { CountdownTimer } from "@/components/public/countdown-timer"
import { useCheckoutTimer } from "@/hooks/use-checkout-timer"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import { cn } from "@/lib/utils"

export function CheckoutHoldClock({
  expiresAt,
  className,
}: {
  expiresAt: string
  className?: string
}) {
  return (
    <div
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Tiempo restante de reserva"
      className={cn(
        "inline-flex min-h-8 min-w-12 items-center justify-end gap-1 rounded-full border border-border/40 bg-secondary/80 px-2.5 py-1 text-foreground",
        className,
      )}
    >
      <Clock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <CountdownTimer
        expiresAt={expiresAt}
        compact
        className="text-xs font-bold tracking-wide"
      />
    </div>
  )
}

export function CheckoutTimer({
  eventId,
  onAcknowledged,
}: {
  eventId: string
  onAcknowledged?: () => void
}) {
  const expiresAt = useCheckoutStore((state) =>
    state.eventId === eventId ? state.holdExpiresAt : null,
  )
  const expiredOpen = useCheckoutStore((state) => state.holdExpiredOpen)
  const seenExpired = useRef(false)
  useCheckoutTimer()

  useEffect(() => {
    if (!expiredOpen || seenExpired.current) return
    seenExpired.current = true
    onAcknowledged?.()
  }, [expiredOpen, onAcknowledged])

  useEffect(() => {
    if (!expiredOpen) seenExpired.current = false
  }, [expiredOpen])

  if (!expiresAt) return null

  return (
    <span className="sr-only">
      <CountdownTimer expiresAt={expiresAt} />
    </span>
  )
}
