"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { cartItemScheduleId } from "@/lib/checkout/cart-line-stamp"
import { storefrontSelectionKey } from "@/lib/checkout/seat-hold-day"
import {
  evaluateStorefrontSelectionLimit,
  type StorefrontLimitReason,
} from "@/lib/checkout-limits"
import { isClosedUnitPricing, storefrontLineTotal } from "@/lib/checkout/charge-unit"
import { reservedPlaceLabel } from "@/lib/seating/seating-type"

export type StorefrontViewMode = "map" | "list"

export type StorefrontSelectedItemType = "seat" | "table" | "zone" | "standing"

export type StorefrontInventoryType =
  | "TABLES"
  | "SEATED_NUMERATED"
  | "GENERAL_ADMISSION"

export type StorefrontSelectedItem = {
  id: string
  name: string
  /** Etiqueta formateada que se imprime en el ticket (Boletería). */
  displayName?: string
  type: StorefrontSelectedItemType
  price: number
  capacity: number
  sectorId?: string
  sectorName?: string
  color?: string
  row?: string
  number?: number
  sellMode?: "per_seat" | "group"
  priceMode?: "closed_unit" | "per_person"
  inventoryType?: StorefrontInventoryType
  ticketTierId?: string
  isMappedSelection?: boolean
  /** Jornada (`event_schedules.id`) del mapa instanciado. */
  eventDateId?: string
  dateId?: string
  scheduleId?: string
  /** Combo / pack que cubre varias jornadas con el mismo asiento. */
  comboTierId?: string
  comboScheduleIds?: string[]
  dateString?: string
  dateLabel?: string
  /** Identificador exacto del asiento/mesa clickeado (ej. "Mesa 04"). */
  seatLabel?: string
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
  eventDateId?: string
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
  incrementSelectedItem: (
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
  replaceSelectedItems: (items: StorefrontSelectedItem[]) => void
}

function itemCapacity(item: StorefrontSelectedItem) {
  return Math.max(1, Math.floor(item.capacity) || 1)
}

function purchaseUnitCount(item: StorefrontSelectedItem) {
  if (
    item.inventoryType === "TABLES" ||
    item.type === "table" ||
    isClosedUnitPricing(item)
  ) {
    return 1
  }
  if (item.type === "seat" || item.inventoryType === "SEATED_NUMERATED") {
    return 1
  }
  return itemCapacity(item)
}

function selectionCount(items: StorefrontSelectedItem[]) {
  return items.reduce((sum, item) => sum + purchaseUnitCount(item), 0)
}

function layoutSeatToItem(seat: StorefrontLayoutSeat): StorefrontSelectedItem {
  const name =
    seat.label?.trim() ||
    reservedPlaceLabel({
      sectorName: seat.sectorName,
      row: seat.row,
      number: seat.number,
    })
  return {
    id: seat.id,
    name,
    displayName: name,
    type: "seat",
    price: seat.price,
    capacity: 1,
    sectorId: seat.sectorId,
    sectorName: seat.sectorName,
    color: seat.color,
    row: seat.row,
    number: seat.number,
    sellMode: "per_seat",
    priceMode: "per_person",
    inventoryType: "SEATED_NUMERATED",
    isMappedSelection: true,
    eventDateId: seat.eventDateId,
    dateId: seat.eventDateId,
    scheduleId: seat.eventDateId,
    seatLabel: name,
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
      sectorName: item.sectorName ?? item.name,
      price: item.price,
      color: item.color ?? "#34d399",
      eventDateId: cartItemScheduleId(item) ?? undefined,
      label: item.seatLabel ?? item.name,
    }))
}

function uniqueItemsById(items: StorefrontSelectedItem[]) {
  const seen = new Set<string>()
  const next: StorefrontSelectedItem[] = []
  for (const item of items) {
    const key = storefrontSelectionKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    next.push(item)
  }
  return next
}

function withDerived(items: StorefrontSelectedItem[]) {
  const unique = uniqueItemsById(items)
  return {
    selectedItems: unique,
    layoutSeats: deriveLayoutSeats(unique),
  }
}

export const useStorefrontSeatStore = create<StorefrontSeatState>()(
  persist(
    (set, get) => ({
  eventId: null,
  view: "map",
  selectedItems: [],
  layoutSeats: [],
  focusedMapIds: [],
  focusTick: 0,

  bindEvent: (eventId) => {
    const current = get().eventId
    if (current === eventId) return
    set({
      eventId,
      view: "map",
      focusedMapIds: [],
      focusTick: 0,
      ...(current && current !== eventId ? withDerived([]) : {}),
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
    const key = storefrontSelectionKey(item)
    if (current.some((entry) => storefrontSelectionKey(entry) === key)) {
      set(
        withDerived(
          current.filter((entry) => storefrontSelectionKey(entry) !== key),
        ),
      )
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
      replacingId: storefrontSelectionKey(nextItem),
      maxTicketsPerUser: maxCount,
    })
    if (!allowed.ok) {
      return { ok: false, reason: allowed.reason }
    }
    const key = storefrontSelectionKey(nextItem)
    const without = current.filter(
      (entry) => storefrontSelectionKey(entry) !== key,
    )
    set(withDerived([...without, nextItem]))
    return {
      ok: true,
      added: !current.some((entry) => storefrontSelectionKey(entry) === key),
    }
  },

  incrementSelectedItem: (item, maxCount) => {
    const current = get().selectedItems
    const key = storefrontSelectionKey(item)
    const existing = current.find(
      (entry) => storefrontSelectionKey(entry) === key,
    )
    return get().upsertSelectedItem(
      {
        ...existing,
        ...item,
        capacity: (existing ? itemCapacity(existing) : 0) + 1,
      },
      maxCount,
    )
  },

  removeSelectedItem: (id) => {
    const current = get().selectedItems
    const next = current.filter((entry) => {
      const key = storefrontSelectionKey(entry)
      if (key === id) return false
      if (!id.includes("::") && entry.id === id && key === entry.id) return false
      return true
    })
    if (next.length === current.length) return
    set(withDerived(next))
  },

  patchSelectedItem: (id, patch) => {
    const current = get().selectedItems
    if (
      !current.some(
        (entry) =>
          storefrontSelectionKey(entry) === id ||
          (!id.includes("::") &&
            entry.id === id &&
            storefrontSelectionKey(entry) === entry.id),
      )
    ) {
      return
    }
    set(
      withDerived(
        current.map((entry) =>
          storefrontSelectionKey(entry) === id ||
          (!id.includes("::") &&
            entry.id === id &&
            storefrontSelectionKey(entry) === entry.id)
            ? { ...entry, ...patch }
            : entry,
        ),
      ),
    )
  },

  clearSelectedItems: () => {
    if (
      get().selectedItems.length === 0 &&
      get().focusedMapIds.length === 0
    ) {
      return
    }
    set({
      ...withDerived([]),
      focusedMapIds: [],
      focusTick: 0,
    })
  },

  toggleLayoutSeat: (seat, maxCount) => {
    return get().toggleSelectedItem(layoutSeatToItem(seat), maxCount)
  },

  setLayoutSeats: (seats, maxCount) => {
    const incomingDate = seats
      .map((seat) => seat.eventDateId)
      .find((id) => Boolean(id))
    const others = get().selectedItems.filter((item) => {
      if (item.type !== "seat") return true
      if (!incomingDate) return false
      return cartItemScheduleId(item) !== incomingDate
    })
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

  replaceSelectedItems: (items) => {
    set(withDerived(items))
  },
}),
    {
      name: "tokepass.seat-intent.v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        eventId: state.eventId,
      }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<StorefrontSeatState>
        return {
          ...current,
          eventId: stored.eventId ?? current.eventId,
          ...withDerived([]),
        }
      },
    },
  ),
)

export function storefrontSelectionCount(items: StorefrontSelectedItem[]) {
  return selectionCount(items)
}

export function storefrontSelectionTotal(items: StorefrontSelectedItem[]) {
  return items.reduce((sum, item) => sum + storefrontLineTotal(item), 0)
}
