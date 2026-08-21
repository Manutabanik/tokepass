import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  boostExternalRef,
  formatBoostRemaining,
  getBoostPlan,
  parseBoostExternalRef,
} from "../lib/boost-plans"

describe("boost-plans", () => {
  it("resolves booster engine plans and legacy prices", () => {
    const pro = getBoostPlan("pro_7d")
    assert.ok(pro)
    assert.equal(pro.priceArs, 35_000)
    assert.equal(pro.durationDays, 7)
    const gold = getBoostPlan("gold")
    assert.ok(gold)
    assert.equal(gold.priceArs, 35_000)
    assert.equal(gold.durationDays, 14)
  })

  it("formats remaining boost time", () => {
    const now = Date.parse("2026-08-21T00:00:00.000Z")
    assert.equal(
      formatBoostRemaining("2026-08-23T05:00:00.000Z", now),
      "2d 5h",
    )
    assert.equal(formatBoostRemaining("2026-08-20T00:00:00.000Z", now), "Finalizado")
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
