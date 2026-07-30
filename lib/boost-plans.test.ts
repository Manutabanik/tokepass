import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  boostExternalRef,
  getBoostPlan,
  parseBoostExternalRef,
} from "../lib/boost-plans"

describe("boost-plans", () => {
  it("resolves known tiers with official prices", () => {
    const gold = getBoostPlan("gold")
    assert.ok(gold)
    assert.equal(gold.priceArs, 35_000)
    assert.equal(gold.durationDays, 14)
  })

  it("returns null for unknown tiers", () => {
    assert.equal(getBoostPlan("diamond"), null)
  })

  it("round-trips external references", () => {
    const id = "11111111-2222-3333-4444-555555555555"
    const ref = boostExternalRef(id)
    assert.equal(ref, `boost:${id}`)
    assert.equal(parseBoostExternalRef(ref), id)
    assert.equal(parseBoostExternalRef("order:xyz"), null)
    assert.equal(parseBoostExternalRef(""), null)
  })
})
