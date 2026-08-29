import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatServiceFeePercent,
  organizerPublicPriceFromBase,
  organizerPublicPriceHintParts,
} from "./organizer-public-price-preview"

describe("organizerPublicPriceFromBase", () => {
  it("marks up the organizer net when the fee is passed to the buyer", () => {
    const preview = organizerPublicPriceFromBase({
      basePrice: 15000,
      absorbFees: false,
      platformFeePercentage: 10,
      platformFixedFee: 0,
      isSponsoredByTokePass: false,
    })
    assert.deepEqual(preview, {
      publicPrice: 16500,
      feePercentage: 10,
      absorbFees: false,
      sponsored: false,
    })
  })

  it("keeps the typed amount as the public price when fees are absorbed", () => {
    const preview = organizerPublicPriceFromBase({
      basePrice: 15000,
      absorbFees: true,
      platformFeePercentage: 10,
      platformFixedFee: 0,
      isSponsoredByTokePass: false,
    })
    assert.equal(preview?.publicPrice, 15000)
    assert.equal(preview?.absorbFees, true)
  })

  it("includes the event fixed fee in the live public price", () => {
    const preview = organizerPublicPriceFromBase({
      basePrice: 15000,
      absorbFees: false,
      platformFeePercentage: 8,
      platformFixedFee: 200,
      isSponsoredByTokePass: false,
    })
    assert.equal(preview?.publicPrice, 16400)
    assert.equal(preview?.feePercentage, 8)
  })

  it("hides the hint while the organizer has not typed a price", () => {
    assert.equal(
      organizerPublicPriceFromBase({
        basePrice: "",
        absorbFees: false,
        platformFeePercentage: 10,
        platformFixedFee: 0,
        isSponsoredByTokePass: false,
      }),
      null,
    )
  })
})

describe("organizerPublicPriceHintParts", () => {
  it("matches the organizer copy for a 10 percent pass-through fee", () => {
    const parts = organizerPublicPriceHintParts({
      publicPrice: 16500,
      feePercentage: 10,
      absorbFees: false,
      sponsored: false,
    })
    assert.equal(parts.prefix, "Precio final al público:")
    assert.match(parts.publicPrice, /16\.500/)
    assert.equal(parts.suffix, "(Incluye 10% de cargo por servicio)")
  })

  it("formats fractional fee points in Spanish", () => {
    assert.equal(formatServiceFeePercent(8.5), "8,5%")
  })
})
