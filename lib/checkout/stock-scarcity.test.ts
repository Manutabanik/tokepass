import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"

describe("stock scarcity", () => {
  it("hides the count when remaining is plentiful", () => {
    assert.deepEqual(resolveStockScarcity(80, 200), { kind: "available" })
    assert.deepEqual(resolveStockScarcity(120, 400, 280), { kind: "available" })
  })

  it("flags low stock by absolute remaining", () => {
    assert.deepEqual(resolveStockScarcity(40, 200), {
      kind: "low",
      remaining: 40,
    })
  })

  it("flags low stock by remaining ratio", () => {
    assert.deepEqual(resolveStockScarcity(80, 1000), {
      kind: "low",
      remaining: 80,
    })
  })

  it("marks sold out", () => {
    assert.deepEqual(resolveStockScarcity(0, 100), { kind: "sold_out" })
  })
})
