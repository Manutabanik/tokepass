import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertIntegerCents,
  centsToGatewayMajorUnits,
  centsToMoney,
  formatCentsAsArs,
  formatCentsAsDecimal,
  moneyAmountsEqual,
  moneyToCents,
  moneyToCentsBigInt,
} from "@/lib/money/cents"

describe("integer cents money", () => {
  it("parses decimal strings without float drift", () => {
    assert.equal(moneyToCents("1500.50"), 150050)
    assert.equal(moneyToCents("0.10"), 10)
    assert.equal(centsToMoney(9100), 91)
  })

  it("compares webhook amounts in cents", () => {
    assert.equal(moneyAmountsEqual(100.1, "100.10"), true)
    assert.equal(moneyAmountsEqual(100.1, 100.11), false)
    assert.equal(moneyAmountsEqual(Number.NaN, 0), false)
  })

  it("sends gateway amounts from integer cents only", () => {
    assert.equal(centsToGatewayMajorUnits(150050), 1500.5)
    assert.equal(centsToGatewayMajorUnits(10000), 100)
    assert.throws(() => assertIntegerCents(10.5))
    assert.throws(() => centsToGatewayMajorUnits(-1))
  })

  it("keeps processing in BigInt cents and formats only at the visual layer", () => {
    assert.equal(moneyToCentsBigInt("10000.00"), 1000000n)
    assert.equal(formatCentsAsDecimal(1000000n), "10000,00")
    assert.equal(formatCentsAsDecimal(-50n), "-0,50")
    assert.match(formatCentsAsArs(1000000n), /10\.000,00/)
  })
})
