"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import {
  holdSeatingUnitForCartByLayoutItem,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import { holdableStorefrontItems } from "@/lib/checkout/holdable-selection"
import { hasCheckoutAuthSession } from "@/lib/checkout/guest-session"
import {
  CHECKOUT_NO_STOCK_TOAST,
  CHECKOUT_TOAST_ERROR_STYLE,
} from "@/lib/checkout/checkout-feedback"
import { minReservedUntil } from "@/lib/checkout-hold"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import {
  useStorefrontSeatStore,
  type StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"

type OptimisticSeatHoldsInput = {
  eventId: string
  previewKey?: string | null
  selectedItems: StorefrontSelectedItem[]
  applyOccupancyPatch: (patch: Record<string, SeatStatus>) => void
}

export function useOptimisticSeatHolds({
  eventId,
  previewKey = null,
  selectedItems,
  applyOccupancyPatch,
}: OptimisticSeatHoldsInput) {
  const heldByLayoutIdRef = useRef(new Map<string, string>())
  const inFlightRef = useRef(new Map<string, Promise<string | null>>())
  const eventIdRef = useRef(eventId)

  useEffect(() => {
    const holdable = holdableStorefrontItems(selectedItems)
    const nextIds = new Set(holdable.map((item) => item.id))
    const held = heldByLayoutIdRef.current

    for (const [layoutId, unitId] of [...held.entries()]) {
      if (nextIds.has(layoutId)) continue
      held.delete(layoutId)
      applyOccupancyPatch({ [layoutId]: "available" })
      void releaseSeatingUnitCartHold(eventId, unitId)
    }

    if (holdable.length === 0) return

    void (async () => {
      if (!(await hasCheckoutAuthSession())) return

      for (const item of holdable) {
        if (held.has(item.id) || inFlightRef.current.has(item.id)) continue
        applyOccupancyPatch({ [item.id]: "occupied" })

        const request = holdSeatingUnitForCartByLayoutItem(
          eventId,
          item.sectorId ?? item.id,
          item.id,
          previewKey,
        )
          .then((hold) => {
            if (!hold.success || !hold.seatingUnitId) {
              if (hold.success === false && hold.error === "auth_required") {
                applyOccupancyPatch({ [item.id]: "available" })
                return null
              }
              applyOccupancyPatch({
                [item.id]: hold.success === false && hold.error === "out_of_stock"
                  ? "occupied"
                  : "available",
              })
              useStorefrontSeatStore.getState().removeSelectedItem(item.id)
              if (hold.success === false && hold.error !== "auth_required") {
                useCheckoutStore.getState().removeItem(item.id)
                if (hold.error === "out_of_stock") {
                  toast.error(CHECKOUT_NO_STOCK_TOAST, {
                    style: CHECKOUT_TOAST_ERROR_STYLE,
                  })
                } else {
                  toast.error("No se pudo reservar esa ubicación. Elegí otra opción.")
                }
              }
              return null
            }

            const stillSelected = useStorefrontSeatStore
              .getState()
              .selectedItems.some((entry) => entry.id === item.id)
            if (!stillSelected) {
              void releaseSeatingUnitCartHold(eventId, hold.seatingUnitId)
              applyOccupancyPatch({ [item.id]: "available" })
              return null
            }

            held.set(item.id, hold.seatingUnitId)
            applyOccupancyPatch({ [item.id]: "occupied" })
            const next = minReservedUntil(
              useCheckoutStore.getState().holdExpiresAt,
              hold.reservedUntil,
            )
            if (next) useCheckoutStore.getState().setHoldExpiresAt(next)
            return hold.seatingUnitId
          })
          .finally(() => {
            inFlightRef.current.delete(item.id)
          })

        inFlightRef.current.set(item.id, request)
      }
    })()
  }, [applyOccupancyPatch, eventId, previewKey, selectedItems])

  useEffect(() => {
    const previousEventId = eventIdRef.current
    if (previousEventId === eventId) return
    eventIdRef.current = eventId
    const held = heldByLayoutIdRef.current
    for (const [layoutId, unitId] of held.entries()) {
      applyOccupancyPatch({ [layoutId]: "available" })
      void releaseSeatingUnitCartHold(previousEventId, unitId)
    }
    held.clear()
    inFlightRef.current.clear()
  }, [applyOccupancyPatch, eventId])
}
