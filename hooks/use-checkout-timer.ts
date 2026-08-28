"use client"

import { useEffect, useRef, useState } from "react"

import { releaseCheckoutCartHolds } from "@/lib/checkout/release-cart-holds"
import {
  cartHasHoldableItems,
  formatCartHoldClock,
  isCartHoldExpired,
  nextCartHoldExpiresAt,
  remainingHoldSeconds,
} from "@/lib/checkout/cart-hold-clock"
import { useCheckoutStore } from "@/lib/stores/checkout-store"

export function useCheckoutTimer(options?: { onExpire?: () => void }) {
  const holdExpiresAt = useCheckoutStore((state) => state.holdExpiresAt)
  const holdFrozen = useCheckoutStore((state) => state.holdFrozen)
  const holdFrozenSeconds = useCheckoutStore((state) => state.holdFrozenSeconds)
  const holdExpiredOpen = useCheckoutStore((state) => state.holdExpiredOpen)
  const itemsCount = useCheckoutStore((state) => state.itemsCount)
  const lines = useCheckoutStore((state) => state.lines)
  const quantities = useCheckoutStore((state) => state.quantities)
  const [, setTick] = useState(0)
  const expiredRef = useRef(false)
  const onExpireRef = useRef(options?.onExpire)

  useEffect(() => {
    onExpireRef.current = options?.onExpire
  }, [options?.onExpire])

  useEffect(() => {
    const hasItems = cartHasHoldableItems({ lines, quantities, itemsCount })
    if (!hasItems || holdExpiresAt) return
    useCheckoutStore.getState().setHoldExpiresAt(nextCartHoldExpiresAt())
  }, [holdExpiresAt, itemsCount, lines, quantities])

  useEffect(() => {
    expiredRef.current = false
    if (!holdExpiresAt || holdFrozen) return

    const id = window.setInterval(() => {
      if (useCheckoutStore.getState().holdFrozen) return
      const now = Date.now()
      setTick((value) => value + 1)
      if (!isCartHoldExpired(holdExpiresAt, now) || expiredRef.current) return
      expiredRef.current = true
      const marked = useCheckoutStore.getState().markHoldExpired()
      if (!marked) return
      const currentEventId = useCheckoutStore.getState().eventId
      releaseCheckoutCartHolds(currentEventId)
      useCheckoutStore.getState().clearCart()
      onExpireRef.current?.()
    }, 1000)

    return () => window.clearInterval(id)
  }, [holdExpiresAt, holdFrozen])

  const remainingSeconds = !holdExpiresAt
    ? 0
    : holdFrozen
      ? (holdFrozenSeconds ?? remainingHoldSeconds(holdExpiresAt))
      : remainingHoldSeconds(holdExpiresAt)

  return {
    remainingSeconds,
    formatted: formatCartHoldClock(holdExpiresAt),
    expiresAt: holdExpiresAt,
    expiredOpen: holdExpiredOpen,
    dismiss: () => useCheckoutStore.getState().dismissHoldExpired(),
  }
}
