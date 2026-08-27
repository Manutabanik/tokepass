import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isCheckoutUuid,
  mappedCheckoutItemFromStorefrontPlace,
  storefrontPlaceNeedsMappedLine,
} from "./storefront-checkout-items"

const tierId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const unitId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

describe("storefront checkout items", () => {
  it("treats seats and tables as mapped cart lines", () => {
    assert.equal(storefrontPlaceNeedsMappedLine("table"), true)
    assert.equal(storefrontPlaceNeedsMappedLine("seat"), true)
    assert.equal(storefrontPlaceNeedsMappedLine("zone"), false)
  })

  it("keeps a closed table without a UUID seating unit", () => {
    const item = mappedCheckoutItemFromStorefrontPlace({
      id: "mesa-09",
      ticketTierId: tierId,
      sectorId: "vip",
      tableNumber: 9,
    })
    assert.ok(item)
    assert.equal(item.type, "mapped")
    assert.equal(item.ticket_tier_id, tierId)
    assert.equal(item.quantity, 1)
    assert.equal(item.element_id, "mesa-09")
    assert.equal(item.elementId, "mesa-09")
    assert.equal(item.seatingUnitId, undefined)
    assert.equal(item.tableNumber, 9)
    assert.equal(isCheckoutUuid("mesa-09"), false)
  })

  it("keeps a resolved seating unit UUID when the map already synced it", () => {
    const item = mappedCheckoutItemFromStorefrontPlace({
      id: "mesa-09",
      ticketTierId: tierId,
      seatingUnitId: unitId,
    })
    assert.ok(item)
    assert.equal(item.seatingUnitId, unitId)
    assert.equal(item.element_id, "mesa-09")
  })

  it("keeps a jornada uuid on the mapped line", () => {
    const dayId = "550e8400-e29b-41d4-a716-446655440001"
    const item = mappedCheckoutItemFromStorefrontPlace({
      id: "mesa-09",
      ticketTierId: tierId,
      eventDateId: dayId,
    })
    assert.ok(item)
    assert.equal(item.eventDateId, dayId)
    assert.equal(item.event_date_id, dayId)
    assert.equal(item.dateId, dayId)
  })
})
