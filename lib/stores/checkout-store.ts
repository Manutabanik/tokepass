"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { useShallow } from "zustand/react/shallow"

import { cartItemCount } from "@/lib/checkout/cart"
import { parseCartTicketLineId } from "@/lib/checkout/cart-lines"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import {
  isCheckoutGuest,
  type CheckoutIdentityMode,
} from "@/lib/checkout/identity"
import type { CheckoutFlowStep } from "@/components/public/checkout-stepper"
import { useStorefrontSeatStore } from "@/lib/stores/storefront-seat-store"

export type { CheckoutIdentityMode }
export type CheckoutPendingAction = "open_map" | "pay" | null
export type CheckoutViewMode = "info" | "checkout"

export type CheckoutSavedSeat = {
  tierId: string
  seatingUnitId: string
  sectorKey: string | null
  tableNumber: number | null
  label: string
  price: number
}

export type StorefrontCartLine = {
  id: string
  name: string
  detail?: string
  dateId?: string | null
  dateLabel?: string
  quantity: number
  price: number
}

export const EMPTY_CHECKOUT_BUYER: CheckoutBuyerInfo = {
  buyerName: "",
  buyerDni: "",
  buyerEmail: "",
  buyerPhone: "",
}

type CheckoutState = {
  eventId: string | null
  eventSlug: string | null
  mode: CheckoutIdentityMode
  isGuest: boolean
  pendingAction: CheckoutPendingAction
  quantities: Record<string, number>
  selectedSeat: CheckoutSavedSeat | null
  buyer: CheckoutBuyerInfo
  subtotal: number
  holdExpiresAt: string | null
  checkoutStep: CheckoutFlowStep
  viewMode: CheckoutViewMode
  identityOpen: boolean
  seatSheetOpen: boolean
  totalAmount: number
  itemsCount: number
  lines: StorefrontCartLine[]
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
  setCheckoutStep: (checkoutStep: CheckoutFlowStep) => void
  setViewMode: (viewMode: CheckoutViewMode) => void
  setIdentityOpen: (identityOpen: boolean) => void
  setSeatSheetOpen: (seatSheetOpen: boolean) => void
  setQuantities: (
    quantities:
      | Record<string, number>
      | ((current: Record<string, number>) => Record<string, number>),
  ) => void
  patchQuantities: (quantities: Record<string, number>) => void
  setSelectedSeat: (selectedSeat: CheckoutSavedSeat | null) => void
  setBuyer: (
    buyer:
      | CheckoutBuyerInfo
      | ((current: CheckoutBuyerInfo) => CheckoutBuyerInfo),
  ) => void
  setCartTotals: (input: { totalAmount: number; itemsCount: number }) => void
  setCartLines: (lines: StorefrontCartLine[]) => void
  resetCartTotals: () => void
  removeItem: (id: string) => void
  clearCart: () => void
  clearBuyerData: () => void
}

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

function sameBuyer(left: CheckoutBuyerInfo, right: CheckoutBuyerInfo) {
  return (
    left.buyerName === right.buyerName &&
    left.buyerDni === right.buyerDni &&
    left.buyerEmail === right.buyerEmail &&
    left.buyerPhone === right.buyerPhone
  )
}

function sameLines(left: StorefrontCartLine[], right: StorefrontCartLine[]) {
  if (left.length !== right.length) return false
  return left.every((line, index) => {
    const other = right[index]
    return (
      other != null &&
      line.id === other.id &&
      line.name === other.name &&
      line.detail === other.detail &&
      line.dateId === other.dateId &&
      line.dateLabel === other.dateLabel &&
      line.quantity === other.quantity &&
      line.price === other.price
    )
  })
}

function sameSeat(
  left: CheckoutSavedSeat | null,
  right: CheckoutSavedSeat | null,
) {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.tierId === right.tierId &&
    left.seatingUnitId === right.seatingUnitId &&
    left.sectorKey === right.sectorKey &&
    left.tableNumber === right.tableNumber &&
    left.label === right.label &&
    left.price === right.price
  )
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set, get) => ({
      eventId: null,
      eventSlug: null,
      mode: "undecided",
      isGuest: false,
      pendingAction: null,
      quantities: {},
      selectedSeat: null,
      buyer: EMPTY_CHECKOUT_BUYER,
      subtotal: 0,
      holdExpiresAt: null,
      checkoutStep: "tickets",
      viewMode: "info",
      identityOpen: false,
      seatSheetOpen: false,
      totalAmount: 0,
      itemsCount: 0,
      lines: [],

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
          sameSeat(current.selectedSeat, selectedSeat) &&
          sameBuyer(current.buyer, buyer) &&
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
          buyer: EMPTY_CHECKOUT_BUYER,
          subtotal: 0,
          holdExpiresAt: null,
          isGuest: false,
          mode: "undecided",
          viewMode: "info",
          checkoutStep: "tickets",
          identityOpen: false,
          seatSheetOpen: false,
          totalAmount: 0,
          itemsCount: 0,
          lines: [],
        })
      },

      setCheckoutStep: (checkoutStep) => {
        if (get().checkoutStep === checkoutStep) return
        set({ checkoutStep })
      },

      setViewMode: (viewMode) => {
        if (get().viewMode === viewMode) return
        set({ viewMode })
      },

      setIdentityOpen: (identityOpen) => set({ identityOpen }),

      setSeatSheetOpen: (seatSheetOpen) => set({ seatSheetOpen }),

      setQuantities: (quantities) => {
        const next =
          typeof quantities === "function"
            ? quantities(get().quantities)
            : quantities
        if (sameQuantities(get().quantities, next)) return
        set({ quantities: next })
      },

      patchQuantities: (quantities) => {
        const next = { ...get().quantities, ...quantities }
        if (sameQuantities(get().quantities, next)) return
        set({ quantities: next })
      },

      setSelectedSeat: (selectedSeat) => {
        if (sameSeat(get().selectedSeat, selectedSeat)) return
        set({ selectedSeat })
      },

      setBuyer: (buyer) => {
        const next = typeof buyer === "function" ? buyer(get().buyer) : buyer
        if (sameBuyer(get().buyer, next)) return
        set({ buyer: next })
      },

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

      setCartLines: (lines) => {
        if (sameLines(get().lines, lines)) return
        set({ lines })
      },

      resetCartTotals: () => {
        const current = get()
        if (
          current.totalAmount === 0 &&
          current.itemsCount === 0 &&
          current.lines.length === 0
        ) {
          return
        }
        set({ totalAmount: 0, itemsCount: 0, lines: [] })
      },

      removeItem: (id) => {
        const ticketId = parseCartTicketLineId(id)
        if (ticketId) {
          if ((get().quantities[ticketId] ?? 0) === 0) return
          set({
            quantities: { ...get().quantities, [ticketId]: 0 },
          })
          return
        }
        useStorefrontSeatStore.getState().removeSelectedItem(id)
        const seat = get().selectedSeat
        if (
          seat &&
          (seat.seatingUnitId === id || seat.label === id)
        ) {
          set({ selectedSeat: null })
        }
      },

      clearCart: () => {
        useStorefrontSeatStore.getState().clearSelectedItems()
        useStorefrontSeatStore.getState().clearLayoutSeats()
        set({
          quantities: {},
          selectedSeat: null,
          lines: [],
          totalAmount: 0,
          itemsCount: 0,
          subtotal: 0,
          holdExpiresAt: null,
          checkoutStep: "tickets",
          seatSheetOpen: false,
        })
      },

      clearBuyerData: () => {
        set({
          buyer: EMPTY_CHECKOUT_BUYER,
          isGuest: false,
          mode: "undecided",
          pendingAction: null,
          identityOpen: false,
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

export function useIsGuestCheckout(currentUserId?: string | null) {
  const mode = useCheckoutStore((state) => state.mode)
  const isGuest = useCheckoutStore((state) => state.isGuest)
  return isCheckoutGuest(mode, currentUserId, isGuest)
}

export function useActiveCheckoutSelection(eventId: string) {
  return useCheckoutStore(
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
