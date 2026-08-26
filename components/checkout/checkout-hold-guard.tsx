"use client"

import { CheckoutHoldExpiredModal } from "@/components/checkout/checkout-hold-expired-modal"
import { useCheckoutTimer } from "@/hooks/use-checkout-timer"

export function CheckoutHoldGuard() {
  const timer = useCheckoutTimer()
  return (
    <CheckoutHoldExpiredModal
      open={timer.expiredOpen}
      onClose={timer.dismiss}
    />
  )
}
