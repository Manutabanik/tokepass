import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  resolveSeatingUnitTierId,
  seatingUnitKeepsIssuedTier,
} from "./sold-unit-tier"

describe("sold-unit-tier", () => {
  it("preserva el tier original de una unidad vendida al cambiar de sector", () => {
    assert.equal(seatingUnitKeepsIssuedTier("sold"), true)
    assert.equal(
      resolveSeatingUnitTierId({
        status: "sold",
        existingTierId: "tier-platea",
        incomingTierId: "tier-vip",
      }),
      "tier-platea",
    )
  })

  it("preserva el tier de una unidad reservada", () => {
    assert.equal(
      resolveSeatingUnitTierId({
        status: "reserved",
        existingTierId: "tier-a",
        incomingTierId: "tier-b",
      }),
      "tier-a",
    )
  })

  it("acepta el tier del sector nuevo si la unidad sigue disponible", () => {
    assert.equal(seatingUnitKeepsIssuedTier("available"), false)
    assert.equal(
      resolveSeatingUnitTierId({
        status: "available",
        existingTierId: "tier-a",
        incomingTierId: "tier-b",
      }),
      "tier-b",
    )
  })
})
