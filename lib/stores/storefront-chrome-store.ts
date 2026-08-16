"use client"

import { create } from "zustand"

type StorefrontChromeState = {
  checkoutTunnel: boolean
  setCheckoutTunnel: (checkoutTunnel: boolean) => void
}

export const useStorefrontChromeStore = create<StorefrontChromeState>(
  (set) => ({
    checkoutTunnel: false,
    setCheckoutTunnel: (checkoutTunnel) => {
      set((current) =>
        current.checkoutTunnel === checkoutTunnel
          ? current
          : { checkoutTunnel },
      )
    },
  }),
)
