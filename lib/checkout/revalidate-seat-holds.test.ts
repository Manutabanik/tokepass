import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { HIGH_DEMAND_LOCK_TIMEOUT } from "./lock-timeout"
import {
  earliestHoldExpiry,
  filterSelectedItemsByHolds,
  isBuyerSoldOutToast,
  isCheckoutStockConflict,
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
    assert.equal(isCheckoutStockConflict("out_of_stock"), true)
    assert.equal(isCheckoutStockConflict("SEATING_UNIT_UNAVAILABLE"), true)
    assert.equal(isCheckoutStockConflict("409 Conflict"), true)
    assert.equal(isCheckoutStockConflict("auth_required"), false)
    assert.equal(isCheckoutStockConflict(HIGH_DEMAND_LOCK_TIMEOUT), false)
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
