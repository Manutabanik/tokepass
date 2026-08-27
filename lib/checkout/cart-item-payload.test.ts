import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  sanitizeCheckoutActionItem,
  toCartItemPayload,
} from "./cart-item-payload"

const tierId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const seatId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

describe("cart item payload", () => {
  it("keeps only identifiers and quantity", () => {
    const payload = toCartItemPayload({
      ticket_tier_id: tierId,
      sectorKey: "platea-a",
      seat_id: seatId,
      quantity: 2,
      price: 15000,
      unit_price: 15000,
      total: 30000,
    })
    assert.deepEqual(payload, {
      ticket_type_id: tierId,
      sector_id: "platea-a",
      seat_id: seatId,
      quantity: 2,
    })
    assert.equal("price" in payload, false)
    assert.equal("total" in payload, false)
  })

  it("accepts ticket_type_id as the canonical ticket id", () => {
    const payload = toCartItemPayload({
      ticket_type_id: tierId,
      sector_id: "campo",
      quantity: 1,
    })
    assert.equal(payload.ticket_type_id, tierId)
    assert.equal(payload.sector_id, "campo")
    assert.equal(payload.seat_id, undefined)
  })

  it("strips client money when expanding to the checkout action item", () => {
    const item = sanitizeCheckoutActionItem({
      ticket_type_id: tierId,
      quantity: 3,
      price: 1,
      unit_price: 1,
      total: 3,
    })
    assert.equal(item.ticket_type_id, tierId)
    assert.equal(item.ticket_tier_id, tierId)
    assert.equal(item.quantity, 3)
    assert.equal(item.type, "general")
    assert.equal("price" in item, false)
    assert.equal("unit_price" in item, false)
    assert.equal("total" in item, false)
  })

  it("keeps a mesa map node as a mapped line via element_id", () => {
    const item = sanitizeCheckoutActionItem({
      type: "mapped",
      ticket_tier_id: tierId,
      quantity: 1,
      element_id: "mesa-09",
      sectorKey: "vip",
      tableNumber: 9,
      price: 40000,
    })
    assert.equal(item.type, "mapped")
    assert.equal(item.ticket_tier_id, tierId)
    assert.equal(item.element_id, "mesa-09")
    assert.equal(item.elementId, "mesa-09")
    assert.equal(item.quantity, 1)
    assert.equal("price" in item, false)
  })

  it("keeps element_id and jornada on the exclusive cart payload", () => {
    const dayId = "550e8400-e29b-41d4-a716-446655440001"
    const payload = toCartItemPayload({
      ticket_tier_id: tierId,
      element_id: "mesa-09",
      eventDateId: dayId,
      quantity: 1,
      price: 40000,
    })
    assert.equal(payload.element_id, "mesa-09")
    assert.equal(payload.event_date_id, dayId)
    assert.equal("price" in payload, false)
  })

  it("keeps the jornada on a mapped mesa line", () => {
    const dayId = "550e8400-e29b-41d4-a716-446655440001"
    const item = sanitizeCheckoutActionItem({
      type: "mapped",
      ticket_tier_id: tierId,
      quantity: 1,
      element_id: "mesa-09",
      eventDateId: dayId,
    })
    assert.equal(item.eventDateId, dayId)
    assert.equal(item.event_date_id, dayId)
    assert.equal(item.dateId, dayId)
  })
})
