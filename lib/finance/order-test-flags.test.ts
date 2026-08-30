import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isSandboxIssuedOrder,
  orderTestFlags,
  shouldMarkOrderAsTest,
} from "./order-test-flags"

describe("order test flags", () => {
  it("stamps sandbox commerce fields", () => {
    assert.deepEqual(orderTestFlags(true), {
      is_test: true,
      environment: "test",
    })
    assert.equal(shouldMarkOrderAsTest({ sandbox: true }), true)
    assert.equal(isSandboxIssuedOrder({ is_test: true }), true)
    assert.equal(isSandboxIssuedOrder({ payment_method: "test_sandbox" }), true)
    assert.equal(isSandboxIssuedOrder({ environment: "test" }), true)
    assert.equal(
      isSandboxIssuedOrder({
        is_test: false,
        payment_method: "mercadopago",
        environment: "production",
      }),
      false,
    )
  })
})
