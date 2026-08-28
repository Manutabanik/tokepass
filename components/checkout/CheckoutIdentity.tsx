"use client"

import type { MouseEvent } from "react"

import { CheckoutIdentityDialog } from "@/components/public/checkout-identity-dialog"
import { useCheckoutStore } from "@/lib/stores/checkout-store"

export function CheckoutIdentity({
  onLogin,
  onGuest,
}: {
  onLogin: () => void
  onGuest: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const open = useCheckoutStore((state) => state.identityOpen)

  return (
    <CheckoutIdentityDialog
      open={open}
      onOpenChange={(next) => {
        const store = useCheckoutStore.getState()
        store.setIdentityOpen(next)
        if (!next && store.mode === "undecided") {
          store.setPendingAction(null)
        }
      }}
      onLogin={onLogin}
      onGuest={onGuest}
    />
  )
}
