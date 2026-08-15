"use client"

import { create } from "zustand"

type StorefrontCartState = {
  totalAmount: number
  itemsCount: number
  setCartTotals: (input: { totalAmount: number; itemsCount: number }) => void
  resetCartTotals: () => void
}

export const useStorefrontCartStore = create<StorefrontCartState>((set, get) => ({
  totalAmount: 0,
  itemsCount: 0,
  setCartTotals: ({ totalAmount, itemsCount }) => {
    const current = get()
    if (
      current.totalAmount === totalAmount &&
      current.itemsCount === itemsCount
    ) {
      return
    }
    set({ totalAmount, itemsCount })
  },
  resetCartTotals: () => {
    const current = get()
    if (current.totalAmount === 0 && current.itemsCount === 0) return
    set({ totalAmount: 0, itemsCount: 0 })
  },
}))
