"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import {
  holdSeatingUnitForCartByLayoutItem,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import { holdableStorefrontItems } from "@/lib/checkout/holdable-selection"
import {
  CHECKOUT_NO_STOCK_TOAST,
  CHECKOUT_TOAST_ERROR_STYLE,
} from "@/lib/checkout/checkout-feedback"
import {
  isSeatUnavailableError,
  isSectorNotConfiguredError,
} from "@/lib/checkout/revalidate-seat-holds"
import { minReservedUntil } from "@/lib/checkout-hold"
import {
  MISSING_EVENT_DATE_ID,
  MISSING_EVENT_DATE_ID_MESSAGE,
  asHoldEventDateId,
  storefrontSelectionKey,
} from "@/lib/checkout/seat-hold-day"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import {
  getCheckoutHoldSessionId,
  useCheckoutStore,
} from "@/lib/stores/checkout-store"
import {
  useStorefrontSeatStore,
  type StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"

function optimisticHoldErrorMessage(error: string): string {
  if (error === MISSING_EVENT_DATE_ID) {
    return MISSING_EVENT_DATE_ID_MESSAGE
  }
  if (error === "not_materialized") {
    return "El sector o asiento no está disponible para la venta (no materializado)."
  }
  if (isSeatUnavailableError(error)) {
    return "Este lugar ya fue reservado por otra persona."
  }
  if (isSectorNotConfiguredError(error)) {
    return "Error de configuración: El sector del mapa no coincide con el inventario."
  }
  if (error === "out_of_stock") {
    return CHECKOUT_NO_STOCK_TOAST
  }
  return error.trim() || "No se pudo reservar esa ubicación. Elegí otra opción."
}

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
    const nextIds = new Set(holdable.map((item) => storefrontSelectionKey(item)))
    const held = heldByLayoutIdRef.current
    const sessionId = getCheckoutHoldSessionId()

    for (const [selectionKey, unitId] of [...held.entries()]) {
      if (nextIds.has(selectionKey)) continue
      const layoutId = selectionKey.split("::")[0] ?? selectionKey
      held.delete(selectionKey)
      applyOccupancyPatch({ [layoutId]: "available" })
      for (const heldUnit of unitId.split(",").filter(Boolean)) {
        void releaseSeatingUnitCartHold(eventId, heldUnit, sessionId)
      }
    }

    if (holdable.length === 0) return

    void (async () => {
      for (const item of holdable) {
        const selectionKey = storefrontSelectionKey(item)
        if (held.has(selectionKey) || inFlightRef.current.has(selectionKey)) continue
        applyOccupancyPatch({ [item.id]: "held" })

        const eventDateId =
          asHoldEventDateId(item.eventDateId) ??
          asHoldEventDateId(item.dateId) ??
          asHoldEventDateId(useCheckoutStore.getState().selectedScheduleId)
        const request = holdSeatingUnitForCartByLayoutItem(
          eventId,
          item.sectorId ?? item.id,
          item.id,
          previewKey,
          eventDateId,
          sessionId,
          item.comboTierId,
        )
          .then((hold) => {
            if (!hold.success || !hold.seatingUnitId) {
              applyOccupancyPatch({
                [item.id]:
                  hold.success === false && hold.error === "out_of_stock"
                    ? "occupied"
                    : "available",
              })
              useStorefrontSeatStore.getState().removeSelectedItem(selectionKey)
              if (hold.success === false) {
                useCheckoutStore.getState().removeItem(selectionKey)
                console.error("[optimistic-seat-hold] reserva rechazada", {
                  layoutItemId: item.id,
                  sectorId: item.sectorId ?? item.id,
                  eventDateId,
                  error: hold.error,
                })
                toast.error(optimisticHoldErrorMessage(hold.error), {
                  style: CHECKOUT_TOAST_ERROR_STYLE,
                })
              }
              return null
            }

            const stillSelected = useStorefrontSeatStore
              .getState()
              .selectedItems.some(
                (entry) => storefrontSelectionKey(entry) === selectionKey,
              )
            if (!stillSelected) {
              for (const heldUnit of (
                hold.seatingUnitIds ?? [hold.seatingUnitId]
              ).filter(Boolean)) {
                void releaseSeatingUnitCartHold(eventId, heldUnit, sessionId)
              }
              applyOccupancyPatch({ [item.id]: "available" })
              return null
            }

            held.set(
              selectionKey,
              (hold.seatingUnitIds ?? [hold.seatingUnitId])
                .filter(Boolean)
                .join(","),
            )
            applyOccupancyPatch({ [item.id]: "held" })
            const next = minReservedUntil(
              useCheckoutStore.getState().holdExpiresAt,
              hold.reservedUntil,
            )
            if (next) useCheckoutStore.getState().setHoldExpiresAt(next)
            return hold.seatingUnitId
          })
          .finally(() => {
            inFlightRef.current.delete(selectionKey)
          })

        inFlightRef.current.set(selectionKey, request)
      }
    })()
  }, [applyOccupancyPatch, eventId, previewKey, selectedItems])

  useEffect(() => {
    const previousEventId = eventIdRef.current
    if (previousEventId === eventId) return
    eventIdRef.current = eventId
    const held = heldByLayoutIdRef.current
    const sessionId = getCheckoutHoldSessionId()
    for (const [selectionKey, unitId] of held.entries()) {
      const layoutId = selectionKey.split("::")[0] ?? selectionKey
      applyOccupancyPatch({ [layoutId]: "available" })
      for (const heldUnit of unitId.split(",").filter(Boolean)) {
        void releaseSeatingUnitCartHold(previousEventId, heldUnit, sessionId)
      }
    }
    held.clear()
    inFlightRef.current.clear()
  }, [applyOccupancyPatch, eventId])
}
