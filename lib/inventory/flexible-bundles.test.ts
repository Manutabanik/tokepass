import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  bundleSavings,
  inferBundleType,
  regularBundlePrice,
  validateBundleDraft,
} from "@/lib/inventory/flexible-bundles"

describe("flexible bundles", () => {
  it("computes regular price from included tiers", () => {
    assert.equal(
      regularBundlePrice(
        [
          { tierId: "a", quantity: 3 },
          { tierId: "b", quantity: 1 },
        ],
        { a: 10000, b: 5000 },
      ),
      35000,
    )
  })

  it("computes savings amount and percent", () => {
    const save = bundleSavings(90000, 65000)
    assert.equal(save.amount, 25000)
    assert.equal(save.percent, 28)
  })

  it("infers volume discount from a single component with qty > 1", () => {
    assert.equal(
      inferBundleType({
        items: [{ tierId: "g", quantity: 4 }],
        componentTierTypes: { g: "general" },
      }),
      "volume_discount",
    )
  })

  it("rejects drafts without components", () => {
    assert.equal(
      validateBundleDraft({
        name: "Pack",
        items: [],
        price: 1000,
        capacity: 10,
      }),
      "Elegí al menos un ítem incluido.",
    )
  })
})
