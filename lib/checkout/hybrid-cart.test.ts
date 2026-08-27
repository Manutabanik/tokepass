import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CHECKOUT_PRICES_CHANGED_ERROR } from "./price-guard"
import {
  amountsMatch,
  quoteHybridCartTotal,
  toReserveRpcItem,
  trustedReserveZoneHints,
} from "./hybrid-cart"
import type { CheckoutCartItem } from "@/lib/validations/checkout"

const general = {
  type: "general",
  ticket_tier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ticketTierId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tierId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  quantity: 3,
} as CheckoutCartItem

const mapped = {
  type: "mapped",
  ticket_tier_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  ticketTierId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  tierId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  quantity: 1,
  seatingUnitId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  seat_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
} as CheckoutCartItem

describe("hybrid cart quote", () => {
  it("multiplies live unit prices by quantity and never uses a client total", () => {
    const quoted = quoteHybridCartTotal({
      items: [general, mapped],
      unitPriceByTier: new Map([
        [general.tierId, 10000],
        [mapped.tierId, 25000],
      ]),
    })
    assert.equal(quoted.ok, true)
    if (quoted.ok) assert.equal(quoted.total, 55000)
    assert.equal(amountsMatch(55000, 55000), true)
  })

  it("rejects a cart whose live ticket_tiers price is gone", () => {
    const quoted = quoteHybridCartTotal({
      items: [general],
      unitPriceByTier: new Map(),
    })
    assert.equal(quoted.ok, false)
    if (!quoted.ok) {
      assert.equal(quoted.error, CHECKOUT_PRICES_CHANGED_ERROR)
    }
  })

  it("does not send a client sector when the line already has a seating unit", () => {
    const spoofed = toReserveRpcItem({
      ...mapped,
      sectorKey: "campo-barato",
      tableNumber: 99,
      zoneId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    assert.equal(spoofed.sector_key, null)
    assert.equal(spoofed.table_number, null)
    assert.equal(spoofed.zone_id, null)
    assert.equal(spoofed.seating_unit_id, mapped.seatingUnitId)
  })

  it("serializes mixed rpc items", () => {
    const generalRpc = toReserveRpcItem(general)
    const mappedRpc = toReserveRpcItem(mapped)
    assert.equal(generalRpc.type, "general")
    assert.equal(generalRpc.quantity, 3)
    assert.equal(generalRpc.seat_id, null)
    assert.equal(generalRpc.is_numbered, false)
    assert.equal(mappedRpc.type, "mapped")
    assert.equal(mappedRpc.quantity, 1)
    assert.equal(mappedRpc.seat_id, mapped.seatingUnitId)
    assert.equal(mappedRpc.is_numbered, true)
    assert.equal(mappedRpc.sector_key, null)
    assert.equal(mappedRpc.zone_id, null)
  })

  it("keeps the jornada on a mapped reserve item", () => {
    const friday = "550e8400-e29b-41d4-a716-446655440001"
    const rpc = toReserveRpcItem({
      ...mapped,
      eventDateId: friday,
      event_date_id: friday,
    })
    assert.equal(rpc.event_date_id, friday)
    assert.equal(rpc.eventDateId, friday)
  })
})

describe("trustedReserveZoneHints", () => {
  it("ignores client sector/table/zone when a seating unit is present", () => {
    const hints = trustedReserveZoneHints({
      seatingUnitId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      unitSectorId: "platea",
      clientSectorKey: "campo-barato",
      clientTableNumber: 99,
      clientZoneId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    assert.deepEqual(hints, {
      sectorKey: "platea",
      tableNumber: null,
      zoneId: null,
    })
  })

  it("drops a GA sector that does not belong to the purchased SKU", () => {
    const hints = trustedReserveZoneHints({
      clientSectorKey: "otro-sector",
      allowedSectorKeys: new Set(["campo"]),
    })
    assert.equal(hints.sectorKey, null)
  })
})
