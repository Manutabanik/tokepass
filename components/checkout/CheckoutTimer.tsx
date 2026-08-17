"use client"

import { Clock } from "lucide-react"
import { toast } from "sonner"

import {
  listCartHolds,
  releaseGaCartHolds,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import { releaseWaitingRoomPass } from "@/app/actions/waiting-room"
import { CountdownTimer } from "@/components/public/countdown-timer"
import { HOLD_EXPIRED_MESSAGE } from "@/lib/checkout-hold"
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

  if (!expiresAt) return null

  function handleHoldExpired() {
    const seat = useCheckoutStore.getState().selectedSeat
    toast.error(HOLD_EXPIRED_MESSAGE)
    void releaseGaCartHolds(eventId)
    if (seat) void releaseSeatingUnitCartHold(eventId, seat.seatingUnitId)
    void listCartHolds(eventId).then((result) => {
      if (!result.success) return
      const released = new Set<string>()
      if (seat?.seatingUnitId) released.add(seat.seatingUnitId)
      for (const hold of result.holds) {
        const unitId = hold.seating_unit_id?.trim()
        if (!unitId || released.has(unitId)) continue
        released.add(unitId)
        void releaseSeatingUnitCartHold(eventId, unitId)
      }
    })
    void releaseWaitingRoomPass()
    useCheckoutStore.getState().clearCart()
    onAcknowledged?.()
  }

  return (
    <span className="sr-only">
      <CountdownTimer expiresAt={expiresAt} onExpire={handleHoldExpired} />
    </span>
  )
}
