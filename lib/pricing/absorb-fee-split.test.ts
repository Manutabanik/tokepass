import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  customerFacingUnitPrice,
  splitAbsorbFee,
} from "./absorb-fee-split"

describe("splitAbsorbFee", () => {
  it("traslada el cargo al comprador cuando absorb_fees es false", () => {
    assert.deepEqual(
      splitAbsorbFee({ ticketPrice: 10000, feeRate: 0.15, absorbFees: false }),
      {
        ticketPrice: 10000,
        feeAmount: 1500,
        customerTotal: 11500,
        organizerEarnings: 10000,
        absorbFees: false,
      },
    )
  })

  it("absorbe el cargo en la ganancia del organizador cuando absorb_fees es true", () => {
    assert.deepEqual(
      splitAbsorbFee({ ticketPrice: 10000, feeRate: 0.15, absorbFees: true }),
      {
        ticketPrice: 10000,
        feeAmount: 1500,
        customerTotal: 10000,
        organizerEarnings: 8500,
        absorbFees: true,
      },
    )
  })

  it("acepta el fee en puntos y suma el cargo fijo por entrada paga", () => {
    const split = splitAbsorbFee({
      ticketPrice: 15000,
      feeRate: 8,
      absorbFees: false,
      fixedFee: 200,
    })
    assert.equal(split.feeAmount, 1400)
    assert.equal(split.customerTotal, 16400)
    assert.equal(split.organizerEarnings, 15000)
  })

  it("no cobra extra ni fee en entradas gratis", () => {
    assert.deepEqual(
      splitAbsorbFee({
        ticketPrice: 0,
        feeRate: 0.15,
        absorbFees: false,
        fixedFee: 200,
      }),
      {
        ticketPrice: 0,
        feeAmount: 0,
        customerTotal: 0,
        organizerEarnings: 0,
        absorbFees: false,
      },
    )
  })
})

describe("customerFacingUnitPrice", () => {
  it("devuelve el total que paga el comprador", () => {
    assert.equal(
      customerFacingUnitPrice(10000, { rate: 0.15, absorbFees: false }),
      11500,
    )
    assert.equal(
      customerFacingUnitPrice(10000, { rate: 0.15, absorbFees: true }),
      10000,
    )
  })
})
