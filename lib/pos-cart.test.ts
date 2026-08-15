import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { bumpPosCart, posCartItemCount, splitPosQuantity } from "@/lib/pos-cart"

describe("POS cart", () => {
  it("adds and removes lines without going over stock", () => {
    const added = bumpPosCart({}, "a", 1, 2)
    assert.deepEqual(added, { a: 1 })
    const full = bumpPosCart(added, "a", 5, 2)
    assert.deepEqual(full, { a: 2 })
    const cleared = bumpPosCart(full, "a", -2, 2)
    assert.deepEqual(cleared, {})
    assert.equal(posCartItemCount(full), 2)
  })

  it("splits quantities to the POS RPC cap", () => {
    assert.deepEqual(splitPosQuantity(45), [20, 20, 5])
    assert.deepEqual(splitPosQuantity(0), [])
  })
})
