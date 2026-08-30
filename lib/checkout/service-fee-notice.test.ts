import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { shouldShowServiceFeeInclusiveNotice } from "./service-fee-notice"

describe("shouldShowServiceFeeInclusiveNotice", () => {
  it("shows only when the fee is passed through to the buyer", () => {
    assert.equal(
      shouldShowServiceFeeInclusiveNotice({ rate: 0.15, absorbFees: false }),
      true,
    )
    assert.equal(
      shouldShowServiceFeeInclusiveNotice({ rate: 0.15, absorbFees: true }),
      false,
    )
    assert.equal(
      shouldShowServiceFeeInclusiveNotice({ rate: 0, absorbFees: false }),
      false,
    )
    assert.equal(
      shouldShowServiceFeeInclusiveNotice({ rate: 15, absorbFees: false }),
      true,
    )
  })
})
