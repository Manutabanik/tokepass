"use client"

import { CheckoutIdentityDialog } from "@/components/public/checkout-identity-dialog"
import { useCheckoutStore } from "@/lib/stores/checkout-store"

export function CheckoutIdentity({
  onLogin,
  onGuest,
}: {
  onLogin: () => void
  onGuest: () => void
}) {
  const open = useCheckoutStore((state) => state.identityOpen)

  return (
    <CheckoutIdentityDialog
      open={open}
      onOpenChange={(next) => {
        useCheckoutStore.getState().setIdentityOpen(next)
        if (!next) useCheckoutStore.getState().setPendingAction(null)
      }}
      onLogin={onLogin}
      onGuest={onGuest}
    />
  )
}
