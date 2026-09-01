import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  BUYER_SEAT_FILL,
  BUYER_SOLD_OPACITY,
  buyerSeatPaint,
} from "./buyer-seat-fill"

describe("buyerSeatPaint", () => {
  it("paints sold seats gray at 40% opacity", () => {
    assert.deepEqual(buyerSeatPaint("sold"), {
      fillColor: BUYER_SEAT_FILL.sold,
      opacity: BUYER_SOLD_OPACITY,
    })
    assert.deepEqual(buyerSeatPaint("occupied"), buyerSeatPaint("sold"))
    assert.equal(BUYER_SEAT_FILL.sold, "#4B5563")
    assert.equal(BUYER_SOLD_OPACITY, 0.4)
  })

  it("paints reserved, held and locked seats gray like sold", () => {
    assert.deepEqual(buyerSeatPaint("held"), buyerSeatPaint("sold"))
    assert.deepEqual(buyerSeatPaint("reserved"), buyerSeatPaint("sold"))
    assert.deepEqual(buyerSeatPaint("locked"), buyerSeatPaint("sold"))
    assert.equal(buyerSeatPaint("available").fillColor, "#EAB308")
  })
})
