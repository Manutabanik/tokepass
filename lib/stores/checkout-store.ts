"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { useShallow } from "zustand/react/shallow"

import { ABSOLUTE_MAX_ITEMS_PER_PURCHASE } from "@/lib/checkout-limits"
import {
  toCartItemPayload,
  type CartItemPayload,
} from "@/lib/checkout/cart-item-payload"
import {
  calculateTotal,
  cartItemCount,
  sumCartQuantities,
  toCartNumber,
} from "@/lib/checkout/cart"
import {
  cartTicketLineId,
  parseCartTicketLineId,
} from "@/lib/checkout/cart-lines"
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
  ticketTierId?: string | null
  ticketTypeId?: string | null
  name: string
  displayName?: string
  detail?: string
  dateId?: string | null
  dateLabel?: string
  quantity: number
  /** Precio visual para el subtotal. Nunca se envía a reserva/checkout. */
  price: number
  seatId?: string | null
  elementId?: string | null
  sectorId?: string | null
  isMappedSelection?: boolean
}

export function storefrontLineToCartPayload(
  line: StorefrontCartLine,
): CartItemPayload {
  return toCartItemPayload({
    ticket_type_id: line.ticketTypeId ?? line.ticketTierId,
    sector_id: line.sectorId,
    seat_id: line.seatId,
    quantity: line.quantity,
  })
}

export type CheckoutCatalogEntry = {
  id: string
  name: string
  price: number
}

export type AddToCartInput = {
  ticketTierId: string
  name: string
  price: number
  quantity?: number
  maxQuantity?: number
  seatId?: string | null
  elementId?: string | null
}

export type AddToCartResult =
  | { ok: true; quantity: number }
  | { ok: false; reason: "limit" }

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
  ticketErrorId: string | null
  ticketErrorMessage: string | null
  totalAmount: number
  itemsCount: number
  lines: StorefrontCartLine[]
  selectedScheduleId: string | null
  catalogByTierId: Record<string, CheckoutCatalogEntry>
  rememberCatalog: (tiers: CheckoutCatalogEntry[]) => void
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
  setTicketError: (ticketId: string | null, message?: string | null) => void
  clearTicketError: () => void
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
  addToCart: (input: AddToCartInput) => AddToCartResult
  setGeneralQuantity: (input: AddToCartInput & { quantity: number }) => AddToCartResult
  setSelectedScheduleId: (scheduleId: string | null) => void
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
      line.price === other.price &&
      line.ticketTierId === other.ticketTierId &&
      line.seatId === other.seatId &&
      line.elementId === other.elementId
    )
  })
}

function isMapCartLine(line: StorefrontCartLine) {
  return Boolean(line.seatId?.trim() || line.elementId?.trim())
}

function generalLineTierId(line: StorefrontCartLine) {
  return line.ticketTierId?.trim() || parseCartTicketLineId(line.id)
}

function cartTotalsFromLines(lines: StorefrontCartLine[]) {
  const totalAmount = calculateTotal(lines)
  const itemsCount = sumCartQuantities(lines)
  return { totalAmount, itemsCount, subtotal: totalAmount }
}

function mergeCatalog(
  current: Record<string, CheckoutCatalogEntry>,
  entries: CheckoutCatalogEntry[],
): Record<string, CheckoutCatalogEntry> {
  if (entries.length === 0) return current
  let changed = false
  const next = { ...current }
  for (const entry of entries) {
    const id = entry.id.trim()
    if (!id) continue
    const existing = next[id]
    if (
      existing &&
      existing.name === entry.name &&
      existing.price === entry.price
    ) {
      continue
    }
    next[id] = { id, name: entry.name, price: toCartNumber(entry.price) }
    changed = true
  }
  return changed ? next : current
}

function fillCatalogGaps(
  current: Record<string, CheckoutCatalogEntry>,
  entries: CheckoutCatalogEntry[],
): Record<string, CheckoutCatalogEntry> {
  if (entries.length === 0) return current
  let changed = false
  const next = { ...current }
  for (const entry of entries) {
    const id = entry.id.trim()
    if (!id || next[id]) continue
    next[id] = { id, name: entry.name, price: toCartNumber(entry.price) }
    changed = true
  }
  return changed ? next : current
}

function upsertGeneralLine(
  lines: StorefrontCartLine[],
  input: {
    ticketTierId: string
    name: string
    price: number
    quantity: number
  },
): StorefrontCartLine[] {
  const others = lines.filter((line) => {
    if (isMapCartLine(line)) return true
    return generalLineTierId(line) !== input.ticketTierId
  })
  if (input.quantity <= 0) return others
  return [
    ...others,
    {
      id: cartTicketLineId(input.ticketTierId),
      ticketTierId: input.ticketTierId,
      ticketTypeId: input.ticketTierId,
      name: input.name,
      quantity: input.quantity,
      price: input.price,
    },
  ]
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
      ticketErrorId: null,
      ticketErrorMessage: null,
      totalAmount: 0,
      itemsCount: 0,
      lines: [],
      selectedScheduleId: null,
      catalogByTierId: {},

      rememberCatalog: (tiers) => {
        const next = mergeCatalog(get().catalogByTierId, tiers)
        if (next === get().catalogByTierId) return
        set({ catalogByTierId: next })
      },

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
        const currentId = get().eventId
        if (!currentId) {
          set({ eventId })
          return
        }
        if (currentId === eventId) return
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
          checkoutStep: "tickets",
          identityOpen: false,
          seatSheetOpen: false,
          totalAmount: 0,
          itemsCount: 0,
          lines: [],
          catalogByTierId: {},
          selectedScheduleId: null,
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

      setTicketError: (ticketId, message = null) => {
        const nextMessage = ticketId ? message ?? null : null
        if (
          get().ticketErrorId === ticketId &&
          get().ticketErrorMessage === nextMessage
        ) {
          return
        }
        set({ ticketErrorId: ticketId, ticketErrorMessage: nextMessage })
      },

      clearTicketError: () => {
        if (!get().ticketErrorId && !get().ticketErrorMessage) return
        set({ ticketErrorId: null, ticketErrorMessage: null })
      },

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
        const catalog = fillCatalogGaps(
          get().catalogByTierId,
          lines
            .map((line) => {
              const id = line.ticketTierId?.trim()
              if (!id) return null
              return { id, name: line.name, price: line.price }
            })
            .filter((entry): entry is CheckoutCatalogEntry => entry != null),
        )
        if (sameLines(get().lines, lines) && catalog === get().catalogByTierId) {
          return
        }
        set({ lines, catalogByTierId: catalog })
      },

      addToCart: (input) => {
        const seatId = input.seatId?.trim() || null
        const elementId = input.elementId?.trim() || null
        const unitPrice =
          input.price === undefined || input.price === null
            ? 0
            : toCartNumber(input.price)
        const maxQuantity = Math.max(
          0,
          Math.floor(toCartNumber(input.maxQuantity ?? ABSOLUTE_MAX_ITEMS_PER_PURCHASE)),
        )
        if (seatId || elementId) {
          const id = seatId || elementId!
          const existing = get().lines.find((line) => line.id === id)
          const incomingQty =
            input.quantity == null
              ? null
              : Math.max(1, Math.floor(toCartNumber(input.quantity)))
          const quantity = seatId
            ? 1
            : incomingQty ?? (existing ? existing.quantity + 1 : 1)
          const others = get().lines.filter((line) => line.id !== id)
          const line: StorefrontCartLine = {
            id,
            ticketTierId: input.ticketTierId,
            ticketTypeId: input.ticketTierId,
            name: input.name,
            quantity,
            price: unitPrice,
            seatId,
            elementId,
          }
          const lines = [...others, line]
          set({
            lines,
            catalogByTierId: mergeCatalog(get().catalogByTierId, [
              {
                id: input.ticketTierId,
                name: input.name,
                price: unitPrice,
              },
            ]),
            ...cartTotalsFromLines(lines),
            selectedSeat: seatId
              ? {
                  tierId: input.ticketTierId,
                  seatingUnitId: seatId,
                  sectorKey: null,
                  tableNumber: null,
                  label: input.name,
                  price: unitPrice,
                }
              : get().selectedSeat,
          })
          return { ok: true, quantity }
        }

        const currentQty = get().quantities[input.ticketTierId] ?? 0
        const delta = input.quantity == null ? 1 : Math.floor(toCartNumber(input.quantity))
        const nextQty = Math.max(0, currentQty + delta)
        if (nextQty > maxQuantity) return { ok: false, reason: "limit" }
        const quantities = { ...get().quantities, [input.ticketTierId]: nextQty }
        const lines = upsertGeneralLine(get().lines, {
          ticketTierId: input.ticketTierId,
          name: input.name,
          price: unitPrice,
          quantity: nextQty,
        })
        set({
          quantities,
          lines,
          catalogByTierId: mergeCatalog(get().catalogByTierId, [
            {
              id: input.ticketTierId,
              name: input.name,
              price: unitPrice,
            },
          ]),
          ...cartTotalsFromLines(lines),
        })
        return { ok: true, quantity: nextQty }
      },

      setGeneralQuantity: (input) => {
        const maxQuantity = Math.max(
          0,
          Math.floor(input.maxQuantity ?? ABSOLUTE_MAX_ITEMS_PER_PURCHASE) || 0,
        )
        const requested = Math.floor(toCartNumber(input.quantity))
        if (requested > maxQuantity) return { ok: false, reason: "limit" }
        const nextQty = Math.min(Math.max(0, requested), maxQuantity)
        const quantities = { ...get().quantities, [input.ticketTierId]: nextQty }
        const unitPrice =
          input.price === undefined || input.price === null
            ? 0
            : toCartNumber(input.price)
        const lines = upsertGeneralLine(get().lines, {
          ticketTierId: input.ticketTierId,
          name: input.name,
          price: unitPrice,
          quantity: nextQty,
        })
        set({
          quantities,
          lines,
          catalogByTierId: mergeCatalog(get().catalogByTierId, [
            {
              id: input.ticketTierId,
              name: input.name,
              price: unitPrice,
            },
          ]),
          ...cartTotalsFromLines(lines),
        })
        return { ok: true, quantity: nextQty }
      },

      setSelectedScheduleId: (scheduleId) => {
        const next = scheduleId?.trim() || null
        const current = get().selectedScheduleId
        if (current === next) return
        const hasCart =
          get().lines.length > 0 ||
          get().itemsCount > 0 ||
          get().selectedSeat != null ||
          Object.values(get().quantities).some((qty) => qty > 0)
        if (current != null && next != null && hasCart) {
          get().clearCart()
        }
        set({ selectedScheduleId: next })
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
        const line = get().lines.find(
          (item) => item.id === id || item.ticketTierId === id,
        )
        const ticketId = parseCartTicketLineId(id) || line?.ticketTierId || null
        if (ticketId && (!line || !isMapCartLine(line))) {
          const lines = get().lines.filter(
            (item) => generalLineTierId(item) !== ticketId,
          )
          set({
            quantities: { ...get().quantities, [ticketId]: 0 },
            lines,
            ...cartTotalsFromLines(lines),
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
          catalogByTierId: {},
          holdExpiresAt: null,
          checkoutStep: "tickets",
          seatSheetOpen: false,
          ticketErrorId: null,
          ticketErrorMessage: null,
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
      name: "tokepass.checkout-intent.v2",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<CheckoutState>
        return {
          ...current,
          eventId: saved.eventId ?? current.eventId,
          eventSlug: saved.eventSlug ?? current.eventSlug,
          mode: saved.mode ?? current.mode,
          isGuest: saved.isGuest || saved.mode === "guest" || current.isGuest,
          buyer: saved.buyer ?? current.buyer,
          viewMode: current.viewMode,
          quantities: {},
          selectedSeat: null,
          holdExpiresAt: null,
          lines: [],
          catalogByTierId: {},
          selectedScheduleId: null,
          totalAmount: 0,
          itemsCount: 0,
          subtotal: 0,
        }
      },
      partialize: (state) => ({
        eventId: state.eventId,
        eventSlug: state.eventSlug,
        mode: state.mode,
        isGuest: state.isGuest || state.mode === "guest",
        buyer: state.buyer,
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
      const itemCount = Math.max(
        cartItemCount(state.quantities, Boolean(state.selectedSeat)),
        sumCartQuantities(state.lines),
        state.itemsCount,
      )
      return { active: itemCount > 0, itemCount, subtotal: state.subtotal }
    }),
  )
}
