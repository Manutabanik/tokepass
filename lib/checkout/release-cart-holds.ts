"use client"

import {
  listCartHolds,
  releaseGaCartHolds,
  releaseSeatHolds,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import { releaseWaitingRoomPass } from "@/app/actions/waiting-room"
import { getCheckoutHoldSessionId, useCheckoutStore } from "@/lib/stores/checkout-store"

/** Libera GA, asientos y waiting room del carrito actual (invitado o logueado). */
export function releaseCheckoutCartHolds(eventId: string | null) {
  const sessionId = getCheckoutHoldSessionId()

  if (!eventId) {
    void releaseSeatHolds(null, sessionId)
    void releaseWaitingRoomPass()
    return
  }

  const seat = useCheckoutStore.getState().selectedSeat
  void releaseGaCartHolds(eventId, sessionId)
  if (seat) {
    void releaseSeatingUnitCartHold(eventId, seat.seatingUnitId, sessionId)
  }
  void listCartHolds(eventId, sessionId).then((result) => {
    if (!result.success) return
    const released = new Set<string>()
    if (seat?.seatingUnitId) released.add(seat.seatingUnitId)
    for (const hold of result.holds) {
      const unitId = hold.seating_unit_id?.trim()
      if (!unitId || released.has(unitId)) continue
      released.add(unitId)
      void releaseSeatingUnitCartHold(eventId, unitId, sessionId)
    }
  })
  void releaseSeatHolds(eventId, sessionId)
  void releaseWaitingRoomPass()
}
