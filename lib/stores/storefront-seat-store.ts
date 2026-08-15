"use client"

import { create } from "zustand"

import {
  evaluateStorefrontSelectionLimit,
  type StorefrontLimitReason,
} from "@/lib/checkout-limits"
import { useStorefrontCartStore } from "@/lib/stores/storefront-cart-store"

export type StorefrontViewMode = "map" | "list"

export type StorefrontSelectedItemType = "seat" | "table" | "zone" | "standing"

export type StorefrontSelectedItem = {
  id: string
  name: string
  type: StorefrontSelectedItemType
  price: number
  capacity: number
  sectorId?: string
  color?: string
  row?: string
  number?: number
}

export type StorefrontLayoutSeat = {
  id: string
  row: string
  number: number
  sectorId: string
  sectorName: string
  price: number
  color: string
  label?: string
}

export type StorefrontToggleResult =
  | { ok: true; added: boolean }
  | { ok: false; reason: StorefrontLimitReason }

type StorefrontSeatState = {
  eventId: string | null
  view: StorefrontViewMode
  selectedItems: StorefrontSelectedItem[]
  layoutSeats: StorefrontLayoutSeat[]
  focusedMapIds: string[]
  focusTick: number
  bindEvent: (eventId: string) => void
  setView: (view: StorefrontViewMode) => void
  setFocusedMapIds: (ids: string[]) => void
  pulseFocus: (ids: string[]) => void
  toggleSelectedItem: (
    item: StorefrontSelectedItem,
    maxCount?: number | null,
  ) => StorefrontToggleResult
  upsertSelectedItem: (
    item: StorefrontSelectedItem,
    maxCount?: number | null,
  ) => StorefrontToggleResult
  removeSelectedItem: (id: string) => void
  patchSelectedItem: (id: string, patch: Partial<StorefrontSelectedItem>) => void
  clearSelectedItems: () => void
  toggleLayoutSeat: (
    seat: StorefrontLayoutSeat,
    maxCount?: number | null,
  ) => StorefrontToggleResult
  setLayoutSeats: (
    seats: StorefrontLayoutSeat[],
    maxCount?: number | null,
  ) => StorefrontToggleResult
  clearLayoutSeats: () => void
}

function itemCapacity(item: StorefrontSelectedItem) {
  return Math.max(1, Math.floor(item.capacity) || 1)
}

function selectionCount(items: StorefrontSelectedItem[]) {
  return items.reduce((sum, item) => sum + itemCapacity(item), 0)
}

function layoutSeatToItem(seat: StorefrontLayoutSeat): StorefrontSelectedItem {
  const name =
    seat.label?.trim() ||
    [seat.sectorName.trim(), `Fila ${seat.row}`, String(seat.number)]
      .filter((part) => part.length > 0)
      .join(" · ")
  return {
    id: seat.id,
    name,
    type: "seat",
    price: seat.price,
    capacity: 1,
    sectorId: seat.sectorId,
    color: seat.color,
    row: seat.row,
    number: seat.number,
  }
}

function deriveLayoutSeats(items: StorefrontSelectedItem[]): StorefrontLayoutSeat[] {
  return items
    .filter((item) => item.type === "seat")
    .map((item) => ({
      id: item.id,
      row: item.row ?? "",
      number: item.number ?? 0,
      sectorId: item.sectorId ?? item.id,
      sectorName: item.name,
      price: item.price,
      color: item.color ?? "#34d399",
    }))
}

function uniqueItemsById(items: StorefrontSelectedItem[]) {
  const seen = new Set<string>()
  const next: StorefrontSelectedItem[] = []
  for (const item of items) {
    const id = item.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push(item)
  }
  return next
}

function withDerived(items: StorefrontSelectedItem[]) {
  const unique = uniqueItemsById(items)
  const totalAmount = unique.reduce(
    (sum, item) => sum + item.price * itemCapacity(item),
    0,
  )
  const itemsCount = selectionCount(unique)
  useStorefrontCartStore.getState().setCartTotals({ totalAmount, itemsCount })
  return {
    selectedItems: unique,
    layoutSeats: deriveLayoutSeats(unique),
  }
}

export const useStorefrontSeatStore = create<StorefrontSeatState>((set, get) => ({
  eventId: null,
  view: "map",
  selectedItems: [],
  layoutSeats: [],
  focusedMapIds: [],
  focusTick: 0,

  bindEvent: (eventId) => {
    if (get().eventId === eventId) return
    set({
      eventId,
      view: "map",
      focusedMapIds: [],
      focusTick: 0,
      ...withDerived([]),
    })
  },

  setView: (view) => {
    if (get().view === view) return
    set({ view })
  },

  setFocusedMapIds: (ids) => {
    const next = ids.filter(Boolean)
    const current = get().focusedMapIds
    if (
      current.length === next.length &&
      current.every((id, index) => id === next[index])
    ) {
      return
    }
    set({ focusedMapIds: next })
  },

  pulseFocus: (ids) => {
    set((state) => ({
      focusedMapIds: ids.filter(Boolean),
      focusTick: state.focusTick + 1,
    }))
  },

  toggleSelectedItem: (item, maxCount) => {
    const current = get().selectedItems
    if (current.some((entry) => entry.id === item.id)) {
      set(withDerived(current.filter((entry) => entry.id !== item.id)))
      return { ok: true, added: false }
    }
    const nextItem = { ...item, capacity: itemCapacity(item) }
    const allowed = evaluateStorefrontSelectionLimit({
      current,
      next: nextItem,
      maxTicketsPerUser: maxCount,
    })
    if (!allowed.ok) {
      return { ok: false, reason: allowed.reason }
    }
    set(withDerived([...current, nextItem]))
    return { ok: true, added: true }
  },

  upsertSelectedItem: (item, maxCount) => {
    const current = get().selectedItems
    const nextItem = { ...item, capacity: itemCapacity(item) }
    const allowed = evaluateStorefrontSelectionLimit({
      current,
      next: nextItem,
      replacingId: item.id,
      maxTicketsPerUser: maxCount,
    })
    if (!allowed.ok) {
      return { ok: false, reason: allowed.reason }
    }
    const without = current.filter((entry) => entry.id !== item.id)
    set(withDerived([...without, nextItem]))
    return { ok: true, added: !current.some((entry) => entry.id === item.id) }
  },

  removeSelectedItem: (id) => {
    const current = get().selectedItems
    if (!current.some((entry) => entry.id === id)) return
    set(withDerived(current.filter((entry) => entry.id !== id)))
  },

  patchSelectedItem: (id, patch) => {
    const current = get().selectedItems
    if (!current.some((entry) => entry.id === id)) return
    set(
      withDerived(
        current.map((entry) =>
          entry.id === id ? { ...entry, ...patch } : entry,
        ),
      ),
    )
  },

  clearSelectedItems: () => {
    if (get().selectedItems.length === 0) return
    set(withDerived([]))
  },

  toggleLayoutSeat: (seat, maxCount) => {
    return get().toggleSelectedItem(layoutSeatToItem(seat), maxCount)
  },

  setLayoutSeats: (seats, maxCount) => {
    const others = get().selectedItems.filter((item) => item.type !== "seat")
    const seen = new Set<string>()
    const nextSeats = seats
      .filter((seat) => {
        const id = seat.id?.trim()
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
      .map(layoutSeatToItem)
    for (const seat of nextSeats) {
      const allowed = evaluateStorefrontSelectionLimit({
        current: [...others, ...nextSeats.filter((item) => item.id !== seat.id)],
        next: seat,
        maxTicketsPerUser: maxCount,
      })
      if (!allowed.ok) {
        return { ok: false, reason: allowed.reason }
      }
    }
    set(withDerived([...others, ...nextSeats]))
    return { ok: true, added: seats.length > 0 }
  },

  clearLayoutSeats: () => {
    const current = get().selectedItems
    const next = current.filter((item) => item.type !== "seat")
    if (next.length === current.length) return
    set(withDerived(next))
  },
}))

export function storefrontSelectionCount(items: StorefrontSelectedItem[]) {
  return selectionCount(items)
}

export function storefrontSelectionTotal(items: StorefrontSelectedItem[]) {
  return items.reduce((sum, item) => sum + item.price * itemCapacity(item), 0)
}
