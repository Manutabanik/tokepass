import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertPendingOrderTicketsReservable,
  assertPersistedTierStock,
  seatingHoldStillLive,
} from "./assert-order-stock"

describe("assertPersistedTierStock", () => {
  it("rejects null capacity", () => {
    const result = assertPersistedTierStock({
      name: "Platea",
      capacity: null,
      sold: 0,
    })
    assert.equal(result.ok, false)
  })

  it("rejects oversold tiers", () => {
    const result = assertPersistedTierStock({
      name: "Platea",
      capacity: 10,
      sold: 11,
    })
    assert.equal(result.ok, false)
  })

  it("accepts reserved stock within capacity", () => {
    const result = assertPersistedTierStock({
      name: "Platea",
      capacity: 10,
      sold: 10,
    })
    assert.equal(result.ok, true)
  })
})

describe("seatingHoldStillLive", () => {
  it("allows tickets without a seating unit", () => {
    assert.equal(
      seatingHoldStillLive({ seatingUnitId: null, orderId: "o1" }).ok,
      true,
    )
  })

  it("rejects expired reserved seats", () => {
    const result = seatingHoldStillLive({
      seatingUnitId: "u1",
      orderId: "o1",
      seatingUnit: {
        status: "reserved",
        reservedUntil: new Date(0).toISOString(),
        reservedOrderId: "o1",
      },
    })
    assert.equal(result.ok, false)
  })
})

describe("assertPendingOrderTicketsReservable", () => {
  it("fails when pending tickets disappeared", () => {
    const result = assertPendingOrderTicketsReservable({
      orderId: "o1",
      tickets: [{ id: "t1", status: "cancelled" }],
    })
    assert.equal(result.ok, false)
  })

  it("passes a live reserved seat", () => {
    const result = assertPendingOrderTicketsReservable({
      orderId: "o1",
      tickets: [
        {
          id: "t1",
          status: "pending_payment",
          seatingUnitId: "u1",
          seatingUnit: {
            status: "reserved",
            reservedUntil: new Date(Date.now() + 60_000).toISOString(),
            reservedOrderId: "o1",
          },
          tier: { id: "tier-1", name: "Platea", capacity: 40, sold: 1 },
        },
      ],
    })
    assert.equal(result.ok, true)
  })
})
