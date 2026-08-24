import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyNetProfitToTicket,
  clampServiceFeePercentage,
  netProfitFromPublicPrice,
  priceFromNetProfit,
  remapTicketsForServiceFee,
} from "./net-profit"

describe("net profit calculator", () => {
  it("marks up the public price from the organizer net", () => {
    const calc = priceFromNetProfit({ netPrice: 10000, feePercentage: 15 })
    assert.equal(calc.organizerNet, 10000)
    assert.equal(calc.serviceFee, 1500)
    assert.equal(calc.publicPrice, 11500)
  })

  it("reverses a stored public price back to net", () => {
    assert.equal(
      netProfitFromPublicPrice({ publicPrice: 11500, feePercentage: 15 }),
      10000,
    )
  })

  it("rewrites ticket.price as the public all-in amount", () => {
    const next = applyNetProfitToTicket(
      { name: "General", price: 0, basePrice: 0 },
      8000,
      10,
    )
    assert.equal(next.basePrice, 8000)
    assert.equal(next.price, 8800)
  })

  it("keeps the net when the global commission changes", () => {
    const remapped = remapTicketsForServiceFee(
      [{ price: 11500, basePrice: 10000 }],
      10,
    )
    assert.equal(remapped[0]?.basePrice, 10000)
    assert.equal(remapped[0]?.price, 11000)
  })

  it("clamps the event commission to the persisted range", () => {
    assert.equal(clampServiceFeePercentage(15), 15)
    assert.equal(clampServiceFeePercentage(140), 95)
    assert.equal(clampServiceFeePercentage(-4), 0)
  })
})
