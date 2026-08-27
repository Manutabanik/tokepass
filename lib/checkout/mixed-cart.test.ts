import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { CheckoutCartItem } from "@/lib/validations/checkout"

import {
  assertSeatedCartItemsHaveUnits,
  generalTierRemaining,
  partitionMixedCartItems,
  tierIsNumbered,
  tierUsesMapInventory,
} from "./mixed-cart"

const tableTier = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const parkingTier = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const seatId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

const mapped = {
  type: "mapped",
  ticket_tier_id: tableTier,
  ticketTierId: tableTier,
  tierId: tableTier,
  quantity: 1,
  seatingUnitId: seatId,
  seat_id: seatId,
} as CheckoutCartItem

const parking = {
  type: "general",
  ticket_tier_id: parkingTier,
  ticketTierId: parkingTier,
  tierId: parkingTier,
  quantity: 1,
} as CheckoutCartItem

const tableAsGeneral = {
  type: "general",
  ticket_tier_id: tableTier,
  ticketTierId: tableTier,
  tierId: tableTier,
  quantity: 1,
} as CheckoutCartItem

describe("mixed cart inventory split", () => {
  it("keeps a numbered table out of general stock", () => {
    const split = partitionMixedCartItems({
      items: [mapped, parking],
      tiers: [
        { id: tableTier, layoutType: "table_combo", hasMap: true },
        { id: parkingTier, layoutType: "general", hasMap: false },
      ],
    })
    assert.deepEqual(
      split.mapItems.map((item) => item.tierId),
      [tableTier],
    )
    assert.deepEqual(
      split.generalItems.map((item) => item.tierId),
      [parkingTier],
    )
  })

  it("rejects a numbered SKU sent as general without a seat", () => {
    assert.deepEqual(
      assertSeatedCartItemsHaveUnits([tableAsGeneral], [
        { id: tableTier, layoutType: "table_combo" },
      ]),
      { ok: false, tierId: tableTier },
    )
    assert.deepEqual(
      assertSeatedCartItemsHaveUnits([mapped, parking], [
        { id: tableTier, layoutType: "table_combo" },
        { id: parkingTier, layoutType: "general" },
      ]),
      { ok: true },
    )
  })

  it("reclassifies a map SKU sent as general", () => {
    const split = partitionMixedCartItems({
      items: [tableAsGeneral, parking],
      tiers: [
        { id: tableTier, layoutType: "table_combo" },
        { id: parkingTier, layoutType: "general", hasMap: false },
      ],
    })
    assert.equal(split.mapItems.length, 1)
    assert.equal(split.generalItems[0]?.tierId, parkingTier)
  })

  it("uses capacity minus sold for general SKUs, not venue-capped available", () => {
    assert.equal(generalTierRemaining({ capacity: 80, sold: 12 }), 68)
    assert.equal(generalTierRemaining({ capacity: 80, sold: 80 }), 0)
  })

  it("keeps a map zone (has_map, not numbered) on general stock", () => {
    assert.equal(tierIsNumbered({ layoutType: "general" }), false)
    assert.equal(
      tierUsesMapInventory(
        { layoutType: "general", seatingSectorId: "naranja", hasMap: true },
        new Set(["naranja"]),
      ),
      false,
    )
    assert.equal(
      tierUsesMapInventory(
        {
          layoutType: "general",
          seatingSectorId: "naranja",
          hasMap: true,
          isNumbered: false,
        },
        new Set(["naranja"]),
      ),
      false,
    )
    const split = partitionMixedCartItems({
      items: [
        {
          ...parking,
          has_map: true,
          is_numbered: false,
          sectorKey: "naranja",
        },
      ],
      tiers: [
        {
          id: parkingTier,
          layoutType: "general",
          seatingSectorId: "naranja",
          hasMap: true,
          isNumbered: false,
        },
      ],
      linkedSectorIds: new Set(["naranja"]),
    })
    assert.equal(split.mapItems.length, 0)
    assert.equal(split.generalItems[0]?.tierId, parkingTier)
  })

  it("still treats numbered table/seat layouts as map inventory", () => {
    assert.equal(
      tierUsesMapInventory(
        { layoutType: "table_combo", seatingSectorId: "vip", hasMap: true },
        new Set(["vip"]),
      ),
      true,
    )
  })
})
