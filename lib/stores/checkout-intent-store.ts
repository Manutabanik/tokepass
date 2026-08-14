"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { useShallow } from "zustand/react/shallow"

import { cartItemCount } from "@/lib/checkout/cart"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import {
  isCheckoutGuest,
  type CheckoutIdentityMode,
} from "@/lib/checkout/identity"

export type { CheckoutIdentityMode }
export type CheckoutPendingAction = "open_map" | "pay" | null

export type CheckoutSavedSeat = {
  tierId: string
  seatingUnitId: string
  sectorKey: string | null
  tableNumber: number | null
  label: string
  price: number
}

const EMPTY_BUYER: CheckoutBuyerInfo = {
  buyerName: "",
  buyerDni: "",
  buyerEmail: "",
  buyerPhone: "",
}

type CheckoutIntentState = {
  eventId: string | null
  eventSlug: string | null
  mode: CheckoutIdentityMode
  /** Persisted guest choice so the pay step still asks for Nombre / DNI / Teléfono. */
  isGuest: boolean
  pendingAction: CheckoutPendingAction
  quantities: Record<string, number>
  selectedSeat: CheckoutSavedSeat | null
  buyer: CheckoutBuyerInfo
  subtotal: number
  holdExpiresAt: string | null
  chooseGuest: (eventId: string, eventSlug?: string | null) => void
  chooseAccount: (eventId: string, eventSlug?: string | null) => void
  markAuthenticated: () => void
  setPendingAction: (action: CheckoutPendingAction) => void
  rememberCart: (input: {
    eventId: string
    eventSlug?: string | null
    quantities: Record<string, number>
    selectedSeat: CheckoutSavedSeat | null
    buyer: CheckoutBuyerInfo
    subtotal: number
    holdExpiresAt?: string | null
  }) => void
  setHoldExpiresAt: (holdExpiresAt: string | null) => void
  consumePendingAction: () => CheckoutPendingAction
  resetIfOtherEvent: (eventId: string) => void
}

export const useCheckoutIntentStore = create<CheckoutIntentState>()(
  persist(
    (set, get) => ({
      eventId: null,
      eventSlug: null,
      mode: "undecided",
      isGuest: false,
      pendingAction: null,
      quantities: {},
      selectedSeat: null,
      buyer: EMPTY_BUYER,
      subtotal: 0,
      holdExpiresAt: null,

      chooseGuest: (eventId, eventSlug = null) =>
        set({
          eventId,
          eventSlug: eventSlug ?? get().eventSlug,
          mode: "guest",
          isGuest: true,
        }),

      chooseAccount: (eventId, eventSlug = null) =>
        set({
          eventId,
          eventSlug: eventSlug ?? get().eventSlug,
          mode: "account",
          isGuest: false,
        }),

      markAuthenticated: () => set({ mode: "account", isGuest: false }),

      setPendingAction: (pendingAction) => set({ pendingAction }),

      rememberCart: ({
        eventId,
        eventSlug,
        quantities,
        selectedSeat,
        buyer,
        subtotal,
        holdExpiresAt,
      }) => {
        const current = get()
        const nextSlug = eventSlug ?? current.eventSlug
        const nextHold =
          holdExpiresAt === undefined ? current.holdExpiresAt : holdExpiresAt
        if (
          current.eventId === eventId &&
          current.eventSlug === nextSlug &&
          current.subtotal === subtotal &&
          current.holdExpiresAt === nextHold &&
          current.selectedSeat === selectedSeat &&
          current.buyer.buyerName === buyer.buyerName &&
          current.buyer.buyerDni === buyer.buyerDni &&
          current.buyer.buyerEmail === buyer.buyerEmail &&
          current.buyer.buyerPhone === buyer.buyerPhone &&
          sameQuantities(current.quantities, quantities)
        ) {
          return
        }
        set({
          eventId,
          eventSlug: nextSlug,
          quantities,
          selectedSeat,
          buyer,
          subtotal,
          holdExpiresAt: nextHold,
        })
      },

      setHoldExpiresAt: (holdExpiresAt) => {
        if (get().holdExpiresAt === holdExpiresAt) return
        set({ holdExpiresAt })
      },

      consumePendingAction: () => {
        const action = get().pendingAction
        if (action) set({ pendingAction: null })
        return action
      },

      resetIfOtherEvent: (eventId) => {
        if (!get().eventId || get().eventId === eventId) return
        set({
          eventId,
          eventSlug: null,
          pendingAction: null,
          quantities: {},
          selectedSeat: null,
          buyer: EMPTY_BUYER,
          subtotal: 0,
          holdExpiresAt: null,
        })
      },
    }),
    {
      name: "tokepass.checkout-intent.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        eventId: state.eventId,
        eventSlug: state.eventSlug,
        mode: state.mode,
        isGuest: state.isGuest || state.mode === "guest",
        pendingAction: state.pendingAction,
        quantities: state.quantities,
        selectedSeat: state.selectedSeat,
        buyer: state.buyer,
        subtotal: state.subtotal,
        holdExpiresAt: state.holdExpiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.mode === "guest") state.isGuest = true
      },
    },
  ),
)

function sameQuantities(
  left: Record<string, number>,
  right: Record<string, number>,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if ((left[key] ?? 0) !== (right[key] ?? 0)) return false
  }
  return true
}

export function useIsGuestCheckout(currentUserId?: string | null) {
  const mode = useCheckoutIntentStore((state) => state.mode)
  const isGuest = useCheckoutIntentStore((state) => state.isGuest)
  return isCheckoutGuest(mode, currentUserId, isGuest)
}

export function useActiveCheckoutSelection(eventId: string) {
  return useCheckoutIntentStore(
    useShallow((state) => {
      if (state.eventId !== eventId) {
        return { active: false, itemCount: 0, subtotal: 0 }
      }
      const itemCount = cartItemCount(
        state.quantities,
        Boolean(state.selectedSeat),
      )
      return { active: itemCount > 0, itemCount, subtotal: state.subtotal }
    }),
  )
}
