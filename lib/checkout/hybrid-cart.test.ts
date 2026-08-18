import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  amountsMatch,
  quoteHybridCartTotal,
  toReserveRpcItem,
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

  it("serializes mixed rpc items", () => {
    const generalRpc = toReserveRpcItem(general)
    const mappedRpc = toReserveRpcItem(mapped)
    assert.equal(generalRpc.type, "general")
    assert.equal(generalRpc.quantity, 3)
    assert.equal(mappedRpc.type, "mapped")
    assert.equal(mappedRpc.quantity, 1)
    assert.equal(mappedRpc.seat_id, mapped.seatingUnitId)
  })
})
