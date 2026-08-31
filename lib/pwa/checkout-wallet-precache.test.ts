import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { shouldPrecacheCheckoutWallet } from "./checkout-wallet-precache"

describe("shouldPrecacheCheckoutWallet", () => {
  it("skips sandbox and free success URLs", () => {
    assert.equal(
      shouldPrecacheCheckoutWallet(
        "?order_id=0652b1ed-4acd-456a-b97a-42f5f6d84237&sandbox=1",
      ),
      false,
    )
    assert.equal(shouldPrecacheCheckoutWallet("free=1"), false)
  })

  it("precache after a live Mercado Pago return", () => {
    assert.equal(
      shouldPrecacheCheckoutWallet("?order_id=abc&payment_id=1"),
      true,
    )
  })
})
