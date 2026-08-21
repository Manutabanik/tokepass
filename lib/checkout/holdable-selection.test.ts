import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  holdableStorefrontItems,
  isHoldableStorefrontItem,
} from "./holdable-selection"

describe("holdable storefront selection", () => {
  it("holds seats and tables only", () => {
    assert.equal(isHoldableStorefrontItem({ type: "seat" }), true)
    assert.equal(isHoldableStorefrontItem({ type: "table" }), true)
    assert.equal(isHoldableStorefrontItem({ type: "zone" }), false)
    assert.equal(isHoldableStorefrontItem({ type: "standing" }), false)
  })

  it("filters mixed carts", () => {
    const items = holdableStorefrontItems([
      {
        id: "s1",
        name: "A1",
        type: "seat",
        price: 10,
        capacity: 1,
      },
      {
        id: "z1",
        name: "General",
        type: "zone",
        price: 10,
        capacity: 2,
      },
    ])
    assert.deepEqual(
      items.map((item) => item.id),
      ["s1"],
    )
  })
})
