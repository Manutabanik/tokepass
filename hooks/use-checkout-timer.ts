"use client"

import { useEffect, useRef, useState } from "react"

import {
  listCartHolds,
  releaseGaCartHolds,
  releaseSeatHolds,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import { releaseWaitingRoomPass } from "@/app/actions/waiting-room"
import {
  cartHasHoldableItems,
  formatCartHoldClock,
  isCartHoldExpired,
  nextCartHoldExpiresAt,
  remainingHoldSeconds,
} from "@/lib/checkout/cart-hold-clock"
import { useCheckoutStore } from "@/lib/stores/checkout-store"

function releaseCartHoldsInBackground(eventId: string | null) {
  if (!eventId) {
    void releaseSeatHolds()
    void releaseWaitingRoomPass()
    return
  }

  const seat = useCheckoutStore.getState().selectedSeat
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
  void releaseSeatHolds(eventId)
  void releaseWaitingRoomPass()
}

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
      releaseCartHoldsInBackground(currentEventId)
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
