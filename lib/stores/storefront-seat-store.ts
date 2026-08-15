"use client"

import { create } from "zustand"

import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"

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
}

export type StorefrontToggleResult =
  | { ok: true; added: boolean }
  | { ok: false; reason: "limit" }

type StorefrontSeatState = {
  eventId: string | null
  view: StorefrontViewMode
  selectedItems: StorefrontSelectedItem[]
  layoutSeats: StorefrontLayoutSeat[]
  bindEvent: (eventId: string) => void
  setView: (view: StorefrontViewMode) => void
  toggleSelectedItem: (
    item: StorefrontSelectedItem,
    maxCount?: number,
  ) => StorefrontToggleResult
  upsertSelectedItem: (item: StorefrontSelectedItem, maxCount?: number) => StorefrontToggleResult
  removeSelectedItem: (id: string) => void
  patchSelectedItem: (id: string, patch: Partial<StorefrontSelectedItem>) => void
  clearSelectedItems: () => void
  toggleLayoutSeat: (
    seat: StorefrontLayoutSeat,
    maxCount?: number,
  ) => StorefrontToggleResult
  setLayoutSeats: (seats: StorefrontLayoutSeat[], maxCount?: number) => StorefrontToggleResult
  clearLayoutSeats: () => void
}

function itemCapacity(item: StorefrontSelectedItem) {
  return Math.max(1, Math.floor(item.capacity) || 1)
}

function selectionCount(items: StorefrontSelectedItem[]) {
  return items.reduce((sum, item) => sum + itemCapacity(item), 0)
}

function layoutSeatToItem(seat: StorefrontLayoutSeat): StorefrontSelectedItem {
  return {
    id: seat.id,
    name: `${seat.sectorName} · Fila ${seat.row} · ${seat.number}`,
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

function withDerived(items: StorefrontSelectedItem[]) {
  return {
    selectedItems: items,
    layoutSeats: deriveLayoutSeats(items),
  }
}

export const useStorefrontSeatStore = create<StorefrontSeatState>((set, get) => ({
  eventId: null,
  view: "map",
  selectedItems: [],
  layoutSeats: [],

  bindEvent: (eventId) => {
    if (get().eventId === eventId) return
    set({
      eventId,
      view: "map",
      ...withDerived([]),
    })
  },

  setView: (view) => {
    if (get().view === view) return
    set({ view })
  },

  toggleSelectedItem: (item, maxCount = MAX_TICKETS_PER_PURCHASE) => {
    const current = get().selectedItems
    if (current.some((entry) => entry.id === item.id)) {
      set(withDerived(current.filter((entry) => entry.id !== item.id)))
      return { ok: true, added: false }
    }
    const nextCount = selectionCount(current) + itemCapacity(item)
    if (nextCount > maxCount) {
      return { ok: false, reason: "limit" }
    }
    set(withDerived([...current, { ...item, capacity: itemCapacity(item) }]))
    return { ok: true, added: true }
  },

  upsertSelectedItem: (item, maxCount = MAX_TICKETS_PER_PURCHASE) => {
    const current = get().selectedItems
    const nextItem = { ...item, capacity: itemCapacity(item) }
    const without = current.filter((entry) => entry.id !== item.id)
    const nextCount = selectionCount(without) + itemCapacity(nextItem)
    if (nextCount > maxCount) {
      return { ok: false, reason: "limit" }
    }
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

  toggleLayoutSeat: (seat, maxCount = MAX_TICKETS_PER_PURCHASE) => {
    return get().toggleSelectedItem(layoutSeatToItem(seat), maxCount)
  },

  setLayoutSeats: (seats, maxCount = MAX_TICKETS_PER_PURCHASE) => {
    const others = get().selectedItems.filter((item) => item.type !== "seat")
    const nextSeats = seats.map(layoutSeatToItem)
    const nextCount = selectionCount([...others, ...nextSeats])
    if (nextCount > maxCount) {
      return { ok: false, reason: "limit" }
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
