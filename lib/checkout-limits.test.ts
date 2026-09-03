import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertCartRemainingStock,
  assertCartTierPurchaseLimits,
  clampGeneralZoneQuantity,
  evaluateStorefrontSelectionLimit,
  generalZoneQuantityMax,
  mapPlaceSelectionCap,
  purchaseCapForTier,
  resolveTierPurchaseMax,
  resolveTierPurchaseMin,
} from "./checkout-limits"

describe("generalZoneQuantityMax", () => {
  it("deja que el stock real recorte el tope por comprador", () => {
    assert.equal(
      generalZoneQuantityMax({ available: 3, purchaseCap: 6 }),
      3,
    )
    assert.equal(
      generalZoneQuantityMax({ available: 40, purchaseCap: 6 }),
      6,
    )
    assert.equal(generalZoneQuantityMax({ available: 0, purchaseCap: 6 }), 0)
  })

  it("cae al aforo de la zona mientras no llegó el inventario", () => {
    assert.equal(
      generalZoneQuantityMax({ zoneCapacity: 2, purchaseCap: 6 }),
      2,
    )
    assert.equal(
      generalZoneQuantityMax({ zoneCapacity: 500, purchaseCap: 6 }),
      6,
    )
    // Aforo sin declarar no es "cero lugares": manda el tope de compra.
    assert.equal(
      generalZoneQuantityMax({ zoneCapacity: 0, purchaseCap: 6 }),
      6,
    )
    assert.equal(generalZoneQuantityMax({ purchaseCap: 6 }), 6)
  })

  it("prefiere el stock aunque haya aforo declarado", () => {
    assert.equal(
      generalZoneQuantityMax({
        available: 1,
        zoneCapacity: 300,
        purchaseCap: 6,
      }),
      1,
    )
  })
})

describe("clampGeneralZoneQuantity", () => {
  it("no deja pasar el tope ni bajar de una entrada", () => {
    assert.equal(clampGeneralZoneQuantity(9, { max: 6 }), 6)
    assert.equal(clampGeneralZoneQuantity(0, { max: 6 }), 1)
    assert.equal(clampGeneralZoneQuantity(-3, { max: 6 }), 1)
    assert.equal(clampGeneralZoneQuantity(2.7, { max: 6 }), 2)
  })

  it("permite el cero cuando se está quitando del carrito", () => {
    assert.equal(clampGeneralZoneQuantity(0, { max: 6, allowZero: true }), 0)
    assert.equal(clampGeneralZoneQuantity(-1, { max: 6, allowZero: true }), 0)
  })

  it("sin stock la única cantidad posible es cero", () => {
    assert.equal(clampGeneralZoneQuantity(3, { max: 0 }), 0)
  })
})

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

  it("counts the same layout item on two jornadas as two units", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    const second = evaluateStorefrontSelectionLimit({
      current: [
        {
          id: "seat-1",
          type: "seat",
          capacity: 1,
          sectorId: "grada",
          eventDateId: dayA,
          dateId: dayA,
        },
      ],
      next: {
        id: "seat-1",
        type: "seat",
        capacity: 1,
        sectorId: "grada",
        eventDateId: dayB,
        dateId: dayB,
      },
      maxTicketsPerUser: 2,
      maxPurchaseLimit: 2,
    })
    assert.equal(second.ok, true)
    const third = evaluateStorefrontSelectionLimit({
      current: [
        {
          id: "seat-1",
          type: "seat",
          capacity: 1,
          sectorId: "grada",
          eventDateId: dayA,
          dateId: dayA,
        },
        {
          id: "seat-1",
          type: "seat",
          capacity: 1,
          sectorId: "grada",
          eventDateId: dayB,
          dateId: dayB,
        },
      ],
      next: {
        id: "seat-2",
        type: "seat",
        capacity: 1,
        sectorId: "grada",
        eventDateId: dayB,
        dateId: dayB,
      },
      maxTicketsPerUser: 2,
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
