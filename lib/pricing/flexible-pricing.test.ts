import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  calculateTierPricing,
  feePercentageFromRate,
  inferTicketFeeStrategy,
} from "./flexible-pricing"

describe("flexible tier pricing", () => {
  it("defaults the helper rate to 15 percent", () => {
    const calc = calculateTierPricing({
      inputValue: 10000,
      feeStrategy: "absorb_in_price",
      calculationMode: "public_price",
    })
    assert.equal(calc.publicPrice, 10000)
    assert.equal(calc.serviceFee, 1500)
    assert.equal(calc.organizerNet, 8500)
    assert.equal(calc.isAbsorbed, true)
  })

  it("absorbs the fee from a public price including the event fixed fee", () => {
    const calc = calculateTierPricing({
      inputValue: 10000,
      feePercentage: 8,
      fixedFee: 200,
      feeStrategy: "absorb_in_price",
      calculationMode: "public_price",
    })
    assert.equal(calc.publicPrice, 10000)
    assert.equal(calc.serviceFee, 1000)
    assert.equal(calc.organizerNet, 9000)
  })

  it("marks up a desired net when the fee is passed to the buyer", () => {
    const calc = calculateTierPricing({
      inputValue: 10000,
      feePercentage: 15,
      feeStrategy: "pass_to_customer",
      calculationMode: "net_income",
    })
    assert.equal(calc.organizerNet, 10000)
    assert.equal(calc.serviceFee, 1500)
    assert.equal(calc.publicPrice, 11500)
    assert.equal(calc.isAbsorbed, false)
  })

  it("reverse-splits a public price when the fee is passed to the buyer", () => {
    const calc = calculateTierPricing({
      inputValue: 11500,
      feePercentage: 15,
      feeStrategy: "pass_to_customer",
      calculationMode: "public_price",
    })
    assert.equal(calc.publicPrice, 11500)
    assert.equal(calc.organizerNet, 10000)
    assert.equal(calc.serviceFee, 1500)
  })

  it("computes the public price that preserves a desired net after absorb", () => {
    const calc = calculateTierPricing({
      inputValue: 8500,
      feePercentage: 15,
      feeStrategy: "absorb_in_price",
      calculationMode: "net_income",
    })
    assert.equal(calc.organizerNet, 8500)
    assert.equal(calc.publicPrice, 10000)
    assert.equal(calc.serviceFee, 1500)
  })

  it("zeros the split for free tickets and sponsored events", () => {
    assert.deepEqual(
      calculateTierPricing({
        inputValue: 0,
        feeStrategy: "pass_to_customer",
        calculationMode: "net_income",
      }),
      {
        organizerNet: 0,
        serviceFee: 0,
        publicPrice: 0,
        isAbsorbed: false,
      },
    )
    const sponsored = calculateTierPricing({
      inputValue: 10000,
      feePercentage: 15,
      fixedFee: 200,
      feeStrategy: "absorb_in_price",
      calculationMode: "public_price",
      sponsored: true,
    })
    assert.equal(sponsored.publicPrice, 10000)
    assert.equal(sponsored.serviceFee, 0)
    assert.equal(sponsored.organizerNet, 10000)
  })

  it("reads percentage points from a decimal organizer rate", () => {
    assert.equal(feePercentageFromRate(0.15), 15)
    assert.equal(feePercentageFromRate(0.08), 8)
    assert.equal(feePercentageFromRate(15), 15)
  })

  it("infers pass-through when the stored net matches the markup split", () => {
    assert.equal(
      inferTicketFeeStrategy({
        publicPrice: 11500,
        organizerNet: 10000,
        feePercentage: 15,
      }),
      "pass_to_customer",
    )
    assert.equal(
      inferTicketFeeStrategy({
        publicPrice: 10000,
        organizerNet: 8500,
        feePercentage: 15,
      }),
      "absorb_in_price",
    )
  })
})
