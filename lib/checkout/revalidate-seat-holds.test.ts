import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { HIGH_DEMAND_LOCK_TIMEOUT } from "./lock-timeout"
import {
  GENERAL_STOCK_UNAVAILABLE,
  SEAT_SELECTION_REQUIRED,
  SEAT_SELECTION_REQUIRED_MESSAGE,
  SEAT_UNAVAILABLE,
  SECTOR_NOT_CONFIGURED,
  encodeGeneralStockUnavailable,
  isGeneralStockUnavailableError,
  isSeatUnavailableError,
  parseGeneralStockUnavailable,
  earliestHoldExpiry,
  filterSelectedItemsByHolds,
  isBuyerSoldOutToast,
  isCheckoutConnectionNoise,
  isCheckoutStockConflict,
  isSeatSelectionRequiredError,
  isSectorNotConfiguredError,
  layoutRequiresSeatSelection,
  rehydrateSelectedItemsFromHolds,
} from "./revalidate-seat-holds"
import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"

const table: StorefrontSelectedItem = {
  id: "unit-1",
  name: "Mesa 4",
  type: "table",
  price: 40000,
  capacity: 4,
}

const zone: StorefrontSelectedItem = {
  id: "zona-a",
  name: "Patio",
  type: "zone",
  price: 12000,
  capacity: 1,
}

describe("revalidate seat holds", () => {
  it("keeps a table that still has a server hold", () => {
    const next = filterSelectedItemsByHolds([table, zone], [
      {
        hold_kind: "seat",
        tier_id: "tier-1",
        quantity: 1,
        seating_unit_id: "unit-1",
        reserved_until: "2026-08-17T01:00:00.000Z",
      },
    ])
    assert.equal(next.length, 2)
  })

  it("drops expired map picks and keeps zones", () => {
    const next = filterSelectedItemsByHolds([table, zone], [])
    assert.deepEqual(next.map((item) => item.id), ["zona-a"])
  })

  it("matches layout_item_id when the store id is the map node", () => {
    const next = filterSelectedItemsByHolds(
      [{ ...table, id: "mesa-4" }],
      [
        {
          hold_kind: "seat",
          tier_id: "tier-1",
          quantity: 1,
          seating_unit_id: "unit-1",
          layout_item_id: "mesa-4",
          reserved_until: "2026-08-17T01:00:00.000Z",
        },
      ],
    )
    assert.equal(next[0]?.id, "mesa-4")
  })

  it("keeps persisted seats when the server holds cannot be read", () => {
    const next = rehydrateSelectedItemsFromHolds({
      items: [table, zone],
      holds: [],
      source: "unavailable",
    })
    assert.deepEqual(next.map((item) => item.id), ["unit-1", "zona-a"])
  })

  it("rebuilds a missing table from a live server hold", () => {
    const next = rehydrateSelectedItemsFromHolds({
      items: [zone],
      holds: [
        {
          hold_kind: "seat",
          tier_id: "tier-1",
          quantity: 1,
          seating_unit_id: "su-1",
          layout_item_id: "mesa-4",
          label: "Mesa 4",
          reserved_until: "2026-08-17T01:00:00.000Z",
        },
      ],
      source: "server",
      resolveHoldItem: (hold) => ({
        id: hold.layout_item_id ?? hold.seating_unit_id ?? "unknown",
        name: hold.label ?? "Lugar",
        type: "table",
        price: 40000,
        capacity: 4,
      }),
    })
    assert.equal(next.some((item) => item.id === "mesa-4"), true)
  })

  it("detects concurrency stock conflicts", () => {
    assert.equal(
      isCheckoutStockConflict('type "public.order_status" does not exist'),
      false,
    )
    assert.equal(isCheckoutStockConflict("out_of_stock"), true)
    assert.equal(isCheckoutStockConflict("SEATING_UNIT_UNAVAILABLE"), false)
    assert.equal(isSeatUnavailableError("SEATING_UNIT_UNAVAILABLE"), true)
    assert.equal(isCheckoutStockConflict("409 Conflict"), true)
    assert.equal(isCheckoutStockConflict("auth_required"), false)
    assert.equal(isCheckoutStockConflict(HIGH_DEMAND_LOCK_TIMEOUT), false)
    assert.equal(isCheckoutStockConflict(SECTOR_NOT_CONFIGURED), false)
    assert.equal(isSectorNotConfiguredError(SECTOR_NOT_CONFIGURED), true)
    assert.equal(isBuyerSoldOutToast(SECTOR_NOT_CONFIGURED), false)
    assert.equal(isCheckoutStockConflict(SEAT_SELECTION_REQUIRED), false)
    assert.equal(isBuyerSoldOutToast(SEAT_SELECTION_REQUIRED), false)
    assert.equal(isBuyerSoldOutToast(SEAT_SELECTION_REQUIRED_MESSAGE), false)
    assert.equal(isSeatSelectionRequiredError(SEAT_SELECTION_REQUIRED), true)
    assert.equal(
      isCheckoutConnectionNoise(
        "No pudimos guardar los cambios. Revisá tu conexión a internet e intentá de nuevo.",
      ),
      true,
    )
    assert.equal(
      isCheckoutStockConflict(
        "No pudimos guardar los cambios. Revisá tu conexión a internet e intentá de nuevo.",
      ),
      false,
    )
    assert.equal(isCheckoutStockConflict(SEAT_UNAVAILABLE), false)
    assert.equal(isCheckoutStockConflict(encodeGeneralStockUnavailable("Estacionamiento Auto")), false)
    assert.equal(isBuyerSoldOutToast(SEAT_UNAVAILABLE), false)
    assert.equal(isBuyerSoldOutToast(GENERAL_STOCK_UNAVAILABLE), false)
    assert.equal(isBuyerSoldOutToast("ERR_NO_STOCK"), false)
    assert.equal(isSeatUnavailableError(SEAT_UNAVAILABLE), true)
    assert.equal(isSeatUnavailableError("ERR_SEAT_TAKEN"), true)
    assert.equal(isGeneralStockUnavailableError(GENERAL_STOCK_UNAVAILABLE), true)
    assert.equal(isGeneralStockUnavailableError("ERR_NO_STOCK"), true)
    assert.match(
      parseGeneralStockUnavailable("GENERAL_STOCK_UNAVAILABLE:Estacionamiento Auto") ?? "",
      /Estacionamiento Auto/,
    )
    assert.equal(layoutRequiresSeatSelection("table_combo"), true)
    assert.equal(layoutRequiresSeatSelection("general"), false)
  })

  it("maps buyer-facing sold-out toasts without B2B save copy", () => {
    assert.equal(isBuyerSoldOutToast("out_of_stock"), true)
    assert.equal(isBuyerSoldOutToast("Entradas agotadas"), true)
    assert.equal(isBuyerSoldOutToast("auth_required"), false)
  })

  it("picks the earliest hold expiry", () => {
    assert.equal(
      earliestHoldExpiry([
        {
          hold_kind: "ga",
          tier_id: "a",
          quantity: 2,
          reserved_until: "2026-08-17T01:10:00.000Z",
        },
        {
          hold_kind: "seat",
          tier_id: "b",
          quantity: 1,
          seating_unit_id: "unit-1",
          reserved_until: "2026-08-17T01:00:00.000Z",
        },
      ]),
      "2026-08-17T01:00:00.000Z",
    )
  })
})
