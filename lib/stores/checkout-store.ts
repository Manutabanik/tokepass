"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { useShallow } from "zustand/react/shallow"

import {
  cartHasHoldableItems,
  nextCartHoldExpiresAt,
  remainingHoldSeconds,
} from "@/lib/checkout/cart-hold-clock"
import { isCheckoutHoldSessionId } from "@/lib/checkout/hold-session"
import {
  ABSOLUTE_MAX_ITEMS_PER_PURCHASE,
  type StorefrontLimitReason,
} from "@/lib/checkout-limits"
import { cartItemScheduleId } from "@/lib/checkout/cart-line-stamp"
import {
  toCartItemPayload,
  type CartItemPayload,
} from "@/lib/checkout/cart-item-payload"
import {
  calculateCartPriceBreakdown,
  cartItemCount,
  cartLineUnitMoney,
  stampCartLinesMoney,
  sumCartQuantities,
  toCartNumber,
  type CartLineMoney,
  type CartPriceBreakdown,
} from "@/lib/checkout/cart"
import {
  cartCompositeItemId,
  cartLineSnapshot,
  cartQuantityKey,
  dropUndatedGeneralState,
  freezeCartLineSnapshot,
  generalLineTierId,
  isMapCartLine,
  mergeImmutableCartLines,
  parseCartCompositeItemId,
  upsertGeneralCartLine,
  type MergeCartLinesOptions,
} from "@/lib/checkout/cart-item-identity"
import { storefrontSelectionKey } from "@/lib/checkout/seat-hold-day"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import {
  isCheckoutGuest,
  type CheckoutIdentityMode,
} from "@/lib/checkout/identity"
import type { CheckoutFlowStep } from "@/components/public/checkout-stepper"
import { fallbackServiceFeeRate } from "@/lib/pricing/event-fees"
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
  scheduleId?: string | null
  dateString?: string | null
  quantity: number
  /** Precio público All-In por unidad. Nunca se envía a reserva/checkout. */
  price: number
  /** Entrada base extraída (unidad). */
  basePrice?: number
  /** Comisión extraída (unidad). */
  serviceFee?: number
  /** Total cobrado por unidad. All-In: igual a `price`. */
  totalPrice?: number
  seatId?: string | null
  elementId?: string | null
  sectorId?: string | null
  sectorName?: string | null
  placeLabel?: string | null
  seatLabel?: string | null
  isMappedSelection?: boolean
}

export function storefrontLineToCartPayload(
  line: StorefrontCartLine,
): CartItemPayload {
  return toCartItemPayload({
    ticket_type_id: line.ticketTypeId ?? line.ticketTierId,
    sector_id: line.sectorId,
    seat_id: line.seatId,
    element_id: line.elementId,
    eventDateId: cartItemScheduleId(line),
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
  scheduleId?: string | null
  dateString?: string | null
  sectorName?: string | null
  seatLabel?: string | null
}

export type AddToCartResult =
  | { ok: true; quantity: number }
  | { ok: false; reason: StorefrontLimitReason }

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
  serviceFee: number
  grandTotal: number
  serviceChargeRate: number
  serviceChargeFixedFee: number
  /** true = el organizador absorbe. false = el comprador paga (precio público All-In). */
  absorbFees: boolean
  getTotals: () => CartPriceBreakdown
  holdExpiresAt: string | null
  holdFrozen: boolean
  holdFrozenSeconds: number | null
  holdExpiredOpen: boolean
  holdExpiryHandled: boolean
  cartSessionId: string | null
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
  freezeHoldClock: () => void
  ensureCartSessionId: () => string
  markHoldExpired: () => boolean
  dismissHoldExpired: () => void
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
  setServiceChargeRule: (input: {
    rate?: number | null
    fixedFee?: number | null
    absorbFees?: boolean | null
  }) => void
  setCartTotals: (input: { totalAmount: number; itemsCount: number }) => void
  setCartLines: (
    lines: StorefrontCartLine[],
    options?: MergeCartLinesOptions,
  ) => void
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
      line.scheduleId === other.scheduleId &&
      line.dateString === other.dateString &&
      line.quantity === other.quantity &&
      line.price === other.price &&
      line.basePrice === other.basePrice &&
      line.serviceFee === other.serviceFee &&
      line.totalPrice === other.totalPrice &&
      line.ticketTierId === other.ticketTierId &&
      line.seatId === other.seatId &&
      line.elementId === other.elementId &&
      line.seatLabel === other.seatLabel &&
      line.placeLabel === other.placeLabel &&
      line.sectorName === other.sectorName
    )
  })
}

function cartTotalsFromLines(
  lines: StorefrontCartLine[],
  rule?: { rate?: number; fixedFee?: number },
) {
  const feeRule = {
    rate: rule?.rate ?? 0,
    fixedFee: rule?.fixedFee ?? 0,
  }
  const stamped = stampCartLinesMoney(lines, feeRule)
  const quote = calculateCartPriceBreakdown(stamped, feeRule)
  return {
    lines: stamped,
    itemsCount: sumCartQuantities(stamped),
    subtotal: quote.subtotal,
    serviceFee: quote.serviceFee,
    grandTotal: quote.grandTotal,
    totalAmount: quote.grandTotal,
  }
}

function totalsForLines(
  lines: StorefrontCartLine[],
  state: { serviceChargeRate: number; serviceChargeFixedFee: number },
) {
  return cartTotalsFromLines(lines, {
    rate: state.serviceChargeRate,
    fixedFee: state.serviceChargeFixedFee,
  })
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

function withCartHoldClock(
  current: Pick<
    CheckoutState,
    | "holdExpiresAt"
    | "holdExpiryHandled"
    | "holdExpiredOpen"
    | "cartSessionId"
    | "lines"
    | "quantities"
    | "itemsCount"
  >,
  next: Partial<CheckoutState>,
): Partial<CheckoutState> {
  const lines = next.lines ?? current.lines
  const quantities = next.quantities ?? current.quantities
  const itemsCount =
    next.itemsCount ??
    (next.lines ? sumCartQuantities(next.lines) : current.itemsCount)
  const hasItems = cartHasHoldableItems({ lines, quantities, itemsCount })
  const extras: Partial<CheckoutState> = {}
  if (!current.cartSessionId && !next.cartSessionId) {
    extras.cartSessionId = createCartSessionId()
  }
  if (!hasItems) {
    if (next.holdExpiresAt === undefined) extras.holdExpiresAt = null
    return { ...next, ...extras }
  }
  if (current.holdExpiryHandled) {
    extras.holdExpiryHandled = false
    extras.holdExpiredOpen = false
    extras.holdExpiresAt = next.holdExpiresAt ?? nextCartHoldExpiresAt()
    return { ...next, ...extras }
  }
  if (!current.holdExpiresAt && !next.holdExpiresAt) {
    extras.holdExpiresAt = nextCartHoldExpiresAt()
  }
  return { ...next, ...extras }
}

function createCartSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
      serviceFee: 0,
      grandTotal: 0,
      serviceChargeRate: fallbackServiceFeeRate(null),
      serviceChargeFixedFee: 0,
      absorbFees: false,
      getTotals: () =>
        calculateCartPriceBreakdown(get().lines, {
          rate: get().serviceChargeRate,
          fixedFee: get().serviceChargeFixedFee,
        }),
      holdExpiresAt: null,
      holdFrozen: false,
      holdFrozenSeconds: null,
      holdExpiredOpen: false,
      holdExpiryHandled: false,
      cartSessionId: null,
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
        holdExpiresAt,
      }) => {
        const current = get()
        const nextSlug = eventSlug ?? current.eventSlug
        const nextHold =
          holdExpiresAt === undefined ? current.holdExpiresAt : holdExpiresAt
        const derived = totalsForLines(current.lines, current)
        if (
          current.eventId === eventId &&
          current.eventSlug === nextSlug &&
          current.subtotal === derived.subtotal &&
          current.serviceFee === derived.serviceFee &&
          current.grandTotal === derived.grandTotal &&
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
          ...derived,
          holdExpiresAt: nextHold,
        })
      },

      setHoldExpiresAt: (holdExpiresAt) => {
        if (get().holdExpiresAt === holdExpiresAt) return
        set({ holdExpiresAt })
      },

      freezeHoldClock: () => {
        if (get().holdFrozen) return
        set({
          holdFrozen: true,
          holdFrozenSeconds: remainingHoldSeconds(get().holdExpiresAt),
        })
      },

      ensureCartSessionId: () => {
        const current = get().cartSessionId
        if (isCheckoutHoldSessionId(current)) return current
        const next = createCartSessionId()
        set({ cartSessionId: next })
        return next
      },

      markHoldExpired: () => {
        const current = get()
        if (current.holdExpiryHandled) return false
        set({
          holdExpiryHandled: true,
          holdExpiredOpen: true,
        })
        return true
      },

      dismissHoldExpired: () => {
        if (!get().holdExpiredOpen) return
        set({ holdExpiredOpen: false })
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
          serviceFee: 0,
          grandTotal: 0,
          serviceChargeRate: fallbackServiceFeeRate(null),
          serviceChargeFixedFee: 0,
          absorbFees: false,
          holdExpiresAt: null,
          holdFrozen: false,
          holdFrozenSeconds: null,
          holdExpiredOpen: false,
          holdExpiryHandled: false,
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

      setServiceChargeRule: ({ rate, fixedFee = 0, absorbFees }) => {
        const current = get()
        const nextRate = fallbackServiceFeeRate(rate)
        const nextFixed = Number.isFinite(Number(fixedFee))
          ? Math.max(0, Number(fixedFee))
          : 0
        const nextAbsorb =
          absorbFees == null ? current.absorbFees : absorbFees === true
        if (
          current.serviceChargeRate === nextRate &&
          current.serviceChargeFixedFee === nextFixed &&
          current.absorbFees === nextAbsorb
        ) {
          return
        }
        set({
          serviceChargeRate: nextRate,
          serviceChargeFixedFee: nextFixed,
          absorbFees: nextAbsorb,
          ...totalsForLines(current.lines, {
            serviceChargeRate: nextRate,
            serviceChargeFixedFee: nextFixed,
          }),
        })
      },

      setCartTotals: ({ totalAmount, itemsCount }) => {
        const current = get()
        const derived = totalsForLines(current.lines, current)
        if (
          current.totalAmount === totalAmount &&
          current.itemsCount === itemsCount &&
          current.subtotal === derived.subtotal &&
          current.serviceFee === derived.serviceFee &&
          current.grandTotal === totalAmount
        ) {
          return
        }
        set({
          ...derived,
          totalAmount,
          itemsCount,
          grandTotal: totalAmount,
        })
      },

      setCartLines: (incoming, options) => {
        const current = get()
        let lines = mergeImmutableCartLines(current.lines, incoming, options)
        let quantities = current.quantities
        for (const line of incoming) {
          if (isMapCartLine(line)) continue
          const ticketId = generalLineTierId(line)
          const day = cartItemScheduleId(line)
          if (!ticketId || !day) continue
          const cleaned = dropUndatedGeneralState(
            quantities,
            lines,
            ticketId,
            day,
          )
          quantities = cleaned.quantities
          lines = cleaned.lines
        }
        const catalog = fillCatalogGaps(
          current.catalogByTierId,
          lines
            .map((line) => {
              const id = line.ticketTierId?.trim()
              if (!id) return null
              return { id, name: line.name, price: line.price }
            })
            .filter((entry): entry is CheckoutCatalogEntry => entry != null),
        )
        if (
          sameLines(current.lines, lines) &&
          catalog === current.catalogByTierId &&
          sameQuantities(current.quantities, quantities)
        ) {
          return
        }
        set(
          withCartHoldClock(current, {
            lines,
            quantities,
            catalogByTierId: catalog,
            ...totalsForLines(lines, current),
          }),
        )
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
        const snapshot = cartLineSnapshot(input)
        if (seatId || elementId) {
          const unitId = seatId || elementId!
          const id = cartCompositeItemId(
            input.ticketTierId,
            snapshot.scheduleId,
            unitId,
          )
          const existing = get().lines.find((line) => {
            if (line.id === id) return true
            const unit = line.seatId?.trim() || line.elementId?.trim()
            return (
              unit === unitId &&
              cartItemScheduleId(line) === snapshot.scheduleId
            )
          })
          const incomingQty =
            input.quantity == null
              ? null
              : Math.max(1, Math.floor(toCartNumber(input.quantity)))
          const quantity = seatId
            ? 1
            : incomingQty ?? (existing ? existing.quantity + 1 : 1)
          const others = get().lines.filter((line) => line.id !== existing?.id && line.id !== id)
          const line = freezeCartLineSnapshot(
            {
              id,
              ticketTierId: input.ticketTierId,
              ticketTypeId: input.ticketTierId,
              name: input.name,
              quantity,
              price: unitPrice,
              seatId,
              elementId,
              sectorName: input.sectorName?.trim() || existing?.sectorName || null,
            },
            existing ? cartLineSnapshot(existing) : snapshot,
          )
          const lines = [...others, line]
          const current = get()
          set(
            withCartHoldClock(current, {
              lines,
              catalogByTierId: mergeCatalog(current.catalogByTierId, [
                {
                  id: input.ticketTierId,
                  name: input.name,
                  price: unitPrice,
                },
              ]),
              ...totalsForLines(lines, current),
              selectedSeat: seatId
                ? {
                    tierId: input.ticketTierId,
                    seatingUnitId: seatId,
                    sectorKey: null,
                    tableNumber: null,
                    label: snapshot.seatLabel || input.name,
                    price: unitPrice,
                  }
                : current.selectedSeat,
            }),
          )
          return { ok: true, quantity }
        }

        const qtyKey = cartQuantityKey(input.ticketTierId, snapshot.scheduleId)
        const currentQty = get().quantities[qtyKey] ?? 0
        const delta = input.quantity == null ? 1 : Math.floor(toCartNumber(input.quantity))
        const nextQty = Math.max(0, currentQty + delta)
        if (nextQty > maxQuantity) return { ok: false, reason: "ticket_limit" }
        const current = get()
        const stamped = dropUndatedGeneralState(
          { ...current.quantities, [qtyKey]: nextQty },
          upsertGeneralCartLine(current.lines, {
            ticketTierId: input.ticketTierId,
            name: input.name,
            price: unitPrice,
            quantity: nextQty,
            scheduleId: input.scheduleId,
            dateString: input.dateString,
            sectorName: input.sectorName,
            seatLabel: input.seatLabel,
          }),
          input.ticketTierId,
          snapshot.scheduleId,
        )
        set(
          withCartHoldClock(current, {
            quantities: stamped.quantities,
            lines: stamped.lines,
            catalogByTierId: mergeCatalog(current.catalogByTierId, [
              {
                id: input.ticketTierId,
                name: input.name,
                price: unitPrice,
              },
            ]),
            ...totalsForLines(stamped.lines, current),
          }),
        )
        return { ok: true, quantity: nextQty }
      },

      setGeneralQuantity: (input) => {
        const maxQuantity = Math.max(
          0,
          Math.floor(input.maxQuantity ?? ABSOLUTE_MAX_ITEMS_PER_PURCHASE) || 0,
        )
        const requested = Math.floor(toCartNumber(input.quantity))
        if (requested > maxQuantity) return { ok: false, reason: "ticket_limit" }
        const nextQty = Math.min(Math.max(0, requested), maxQuantity)
        const snapshot = cartLineSnapshot(input)
        const qtyKey = cartQuantityKey(input.ticketTierId, snapshot.scheduleId)
        const unitPrice =
          input.price === undefined || input.price === null
            ? 0
            : toCartNumber(input.price)
        const current = get()
        const stamped = dropUndatedGeneralState(
          { ...current.quantities, [qtyKey]: nextQty },
          upsertGeneralCartLine(current.lines, {
            ticketTierId: input.ticketTierId,
            name: input.name,
            price: unitPrice,
            quantity: nextQty,
            scheduleId: input.scheduleId,
            dateString: input.dateString,
            sectorName: input.sectorName,
            seatLabel: input.seatLabel,
          }),
          input.ticketTierId,
          snapshot.scheduleId,
        )
        set(
          withCartHoldClock(current, {
            quantities: stamped.quantities,
            lines: stamped.lines,
            catalogByTierId: mergeCatalog(current.catalogByTierId, [
              {
                id: input.ticketTierId,
                name: input.name,
                price: unitPrice,
              },
            ]),
            ...totalsForLines(stamped.lines, current),
          }),
        )
        return { ok: true, quantity: nextQty }
      },

      setSelectedScheduleId: (scheduleId) => {
        const next = scheduleId?.trim() || null
        if (get().selectedScheduleId === next) return
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
        set({
          totalAmount: 0,
          itemsCount: 0,
          subtotal: 0,
          serviceFee: 0,
          grandTotal: 0,
          lines: [],
        })
      },

      removeItem: (id) => {
        const current = get()
        const line = current.lines.find((item) => item.id === id)
        const parsed = parseCartCompositeItemId(id)
        const ticketId =
          (line ? generalLineTierId(line) : parsed?.ticketId) || null
        const qtyKey =
          line && ticketId && !isMapCartLine(line)
            ? cartQuantityKey(ticketId, cartItemScheduleId(line))
            : parsed && parsed.ticketId && !parsed.unitId
              ? cartQuantityKey(parsed.ticketId, parsed.scheduleId)
              : null
        const lines = current.lines.filter((item) => item.id !== id)
        const quantities = { ...current.quantities }
        if (qtyKey) delete quantities[qtyKey]
        if (
          ticketId &&
          !lines.some(
            (item) =>
              !isMapCartLine(item) && generalLineTierId(item) === ticketId,
          )
        ) {
          delete quantities[ticketId]
        }
        set(
          withCartHoldClock(current, {
            quantities,
            lines,
            ...totalsForLines(lines, current),
          }),
        )
        const seats = useStorefrontSeatStore.getState()
        seats.removeSelectedItem(id)
        const unitId = line?.seatId?.trim() || line?.elementId?.trim()
        if (line && unitId) {
          seats.removeSelectedItem(unitId)
          seats.removeSelectedItem(
            storefrontSelectionKey({
              id: unitId,
              eventDateId: cartItemScheduleId(line),
            }),
          )
        }
        const seat = get().selectedSeat
        if (
          seat &&
          (seat.seatingUnitId === id ||
            seat.seatingUnitId === unitId ||
            seat.label === id)
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
          serviceFee: 0,
          grandTotal: 0,
          catalogByTierId: {},
          holdExpiresAt: null,
          holdFrozen: false,
          holdFrozenSeconds: null,
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
          holdFrozen: false,
          holdFrozenSeconds: null,
          holdExpiredOpen: false,
          holdExpiryHandled: false,
          cartSessionId: isCheckoutHoldSessionId(saved.cartSessionId)
            ? saved.cartSessionId
            : current.cartSessionId,
          lines: [],
          catalogByTierId: {},
          selectedScheduleId: null,
          totalAmount: 0,
          itemsCount: 0,
          subtotal: 0,
          serviceFee: 0,
          grandTotal: 0,
        }
      },
      partialize: (state) => ({
        eventId: state.eventId,
        eventSlug: state.eventSlug,
        mode: state.mode,
        isGuest: state.isGuest || state.mode === "guest",
        buyer: state.buyer,
        cartSessionId: state.cartSessionId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.mode === "guest") state.isGuest = true
      },
    },
  ),
)

export function getCheckoutHoldSessionId() {
  return useCheckoutStore.getState().ensureCartSessionId()
}

export function useIsGuestCheckout(currentUserId?: string | null) {
  const mode = useCheckoutStore((state) => state.mode)
  const isGuest = useCheckoutStore((state) => state.isGuest)
  return isCheckoutGuest(mode, currentUserId, isGuest)
}

export function selectCartPriceBreakdown(state: {
  lines: StorefrontCartLine[]
  serviceChargeRate: number
  serviceChargeFixedFee: number
}): CartPriceBreakdown {
  return calculateCartPriceBreakdown(state.lines, {
    rate: state.serviceChargeRate,
    fixedFee: state.serviceChargeFixedFee,
  })
}

/** Getter derivado: se recalcula desde líneas + tarifa del evento. */
export function useCartPriceBreakdown(): CartPriceBreakdown {
  return useCheckoutStore(useShallow(selectCartPriceBreakdown))
}

export function useCartServiceFeeRule() {
  return useCheckoutStore(
    useShallow((state) => ({
      rate: state.serviceChargeRate,
      fixedFee: state.serviceChargeFixedFee,
    })),
  )
}

export function useCartLineUnitMoney(publicPrice: number): CartLineMoney {
  const rule = useCartServiceFeeRule()
  return cartLineUnitMoney(publicPrice, rule)
}

export function useActiveCheckoutSelection(eventId: string) {
  return useCheckoutStore(
    useShallow((state) => {
      const quote = selectCartPriceBreakdown(state)
      if (state.eventId !== eventId) {
        return {
          active: false,
          itemCount: 0,
          subtotal: 0,
          serviceFee: 0,
          grandTotal: 0,
        }
      }
      const itemCount = Math.max(
        cartItemCount(state.quantities, Boolean(state.selectedSeat)),
        sumCartQuantities(state.lines),
        state.itemsCount,
      )
      return { active: itemCount > 0, itemCount, ...quote }
    }),
  )
}
