import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertCartRemainingStock,
  assertCartTierPurchaseLimits,
  evaluateStorefrontSelectionLimit,
  mapPlaceSelectionCap,
  purchaseCapForTier,
  resolveTierPurchaseMax,
  resolveTierPurchaseMin,
} from "./checkout-limits"

describe("tier purchase limits", () => {
  it("uses the SKU max before the event fallback", () => {
    assert.equal(
      resolveTierPurchaseMax({ maxPurchaseLimit: 2, fallbackMax: 10 }),
      2,
    )
    assert.equal(
      resolveTierPurchaseMax({ maxPurchaseLimit: null, fallbackMax: 10 }),
      10,
    )
    assert.equal(
      resolveTierPurchaseMax({ maxPurchaseLimit: 0, fallbackMax: null }),
      null,
    )
    assert.equal(resolveTierPurchaseMin(null), 1)
    assert.equal(resolveTierPurchaseMin(3), 3)
  })

  it("does not share a global cap across SKUs", () => {
    const result = assertCartTierPurchaseLimits({
      fallbackMax: 10,
      tiers: [
        { id: "mesa", name: "Mesa VIP", maxPurchaseLimit: 2 },
        { id: "pista", name: "Pista", maxPurchaseLimit: null },
      ],
      items: [
        { tierId: "mesa", quantity: 2 },
        { tierId: "pista", quantity: 10 },
      ],
    })
    assert.equal(result.ok, true)
  })

  it("rejects a single SKU over its max", () => {
    const result = assertCartTierPurchaseLimits({
      fallbackMax: 10,
      tiers: [{ id: "mesa", name: "Mesa VIP", maxPurchaseLimit: 2 }],
      items: [{ tierId: "mesa", quantity: 3 }],
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.match(result.error, /Mesa VIP/)
      assert.match(result.error, /2/)
    }
  })

  it("counts map tables as units of the same sector only", () => {
    const first = evaluateStorefrontSelectionLimit({
      current: [],
      next: { id: "t1", type: "table", capacity: 8, sectorId: "vip" },
      maxTicketsPerUser: 10,
      maxPurchaseLimit: 2,
    })
    assert.equal(first.ok, true)
    const second = evaluateStorefrontSelectionLimit({
      current: [{ id: "t1", type: "table", capacity: 8, sectorId: "vip" }],
      next: { id: "t2", type: "table", capacity: 8, sectorId: "vip" },
      maxTicketsPerUser: 10,
      maxPurchaseLimit: 2,
    })
    assert.equal(second.ok, true)
    const third = evaluateStorefrontSelectionLimit({
      current: [
        { id: "t1", type: "table", capacity: 8, sectorId: "vip" },
        { id: "t2", type: "table", capacity: 8, sectorId: "vip" },
      ],
      next: { id: "t3", type: "table", capacity: 8, sectorId: "vip" },
      maxTicketsPerUser: 10,
      maxPurchaseLimit: 2,
    })
    assert.equal(third.ok, false)
  })

  it("uses layout fallback only when no SKU or event max exists", () => {
    assert.equal(
      purchaseCapForTier({
        layoutType: "table_combo",
        maxPurchaseLimit: null,
        fallbackMax: null,
      }),
      80,
    )
    assert.equal(
      purchaseCapForTier({
        layoutType: "table_combo",
        maxPurchaseLimit: 2,
        fallbackMax: 10,
      }),
      2,
    )
  })

  it("allows several tables when the event has no explicit 1-place lock", () => {
    assert.equal(
      mapPlaceSelectionCap({ layoutType: "table_combo", fallbackMax: null }),
      4,
    )
    assert.equal(
      mapPlaceSelectionCap({ isTable: true, fallbackMax: 6 }),
      6,
    )
  })
})

describe("assertCartRemainingStock", () => {
  it("rejects quantity above remaining capacity", () => {
    const result = assertCartRemainingStock({
      items: [{ tierId: "pista", quantity: 6 }],
      tiers: [{ id: "pista", name: "Pista", capacity: 10, sold: 5 }],
    })
    assert.equal(result.ok, false)
  })

  it("allows quantity within remaining capacity", () => {
    const result = assertCartRemainingStock({
      items: [{ tierId: "pista", quantity: 5 }],
      tiers: [{ id: "pista", name: "Pista", capacity: 10, sold: 5 }],
    })
    assert.equal(result.ok, true)
  })
})
