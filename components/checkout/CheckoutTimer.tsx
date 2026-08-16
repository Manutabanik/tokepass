"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import {
  releaseGaCartHolds,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import { releaseWaitingRoomPass } from "@/app/actions/waiting-room"
import { ReservationTimerBar } from "@/components/public/reservation-timer-bar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCheckoutStore } from "@/lib/stores/checkout-store"

export function CheckoutTimer({
  eventId,
  onAcknowledged,
}: {
  eventId: string
  onAcknowledged?: () => void
}) {
  const router = useRouter()
  const expiresAt = useCheckoutStore((state) =>
    state.eventId === eventId ? state.holdExpiresAt : null,
  )
  const [expiredOpen, setExpiredOpen] = useState(false)

  if (!expiresAt) return null

  function handleHoldExpired() {
    const seat = useCheckoutStore.getState().selectedSeat
    void releaseGaCartHolds(eventId)
    if (seat) void releaseSeatingUnitCartHold(eventId, seat.seatingUnitId)
    void releaseWaitingRoomPass()
    useCheckoutStore.getState().clearCart()
    useCheckoutStore.getState().setCheckoutStep("tickets")
    setExpiredOpen(true)
    router.refresh()
  }

  function acknowledge() {
    setExpiredOpen(false)
    onAcknowledged?.()
  }

  return (
    <>
      <ReservationTimerBar expiresAt={expiresAt} onExpire={handleHoldExpired} />
      <Dialog
        open={expiredOpen}
        onOpenChange={(open) => {
          if (open) {
            setExpiredOpen(true)
            return
          }
          acknowledge()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="z-[110] sm:max-w-md"
          overlayClassName="z-[110]"
        >
          <DialogHeader>
            <DialogTitle>Tiempo de reserva agotado</DialogTitle>
            <DialogDescription>
              El tiempo expiró y los lugares fueron liberados. Volvé a elegir
              tus entradas si querés continuar la compra.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={acknowledge}>
              Volver al evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
