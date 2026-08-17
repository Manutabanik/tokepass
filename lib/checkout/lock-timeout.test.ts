import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  HIGH_DEMAND_LOCK_TIMEOUT,
  isHighDemandLockError,
  isHighDemandRpcError,
  reserveRpcErrorText,
} from "@/lib/checkout/lock-timeout"

describe("high demand lock mapping", () => {
  it("detects postgres lock timeout and deadlock codes", () => {
    assert.equal(isHighDemandLockError("55P03"), true)
    assert.equal(isHighDemandLockError("lock_not_available"), true)
    assert.equal(
      isHighDemandLockError("canceling statement due to lock timeout"),
      true,
    )
    assert.equal(isHighDemandLockError("40P01"), true)
    assert.equal(isHighDemandLockError("deadlock detected"), true)
  })

  it("does not treat stock errors as lock collisions", () => {
    assert.equal(isHighDemandLockError("out_of_stock"), false)
    assert.equal(isHighDemandLockError("SEATING_UNIT_UNAVAILABLE"), false)
    assert.equal(HIGH_DEMAND_LOCK_TIMEOUT, "HIGH_DEMAND_LOCK_TIMEOUT")
  })

  it("reads postgres codes from the RPC error object", () => {
    assert.equal(
      isHighDemandRpcError({
        code: "55P03",
        message: "canceling statement due to lock timeout",
      }),
      true,
    )
    assert.equal(
      isHighDemandRpcError({ code: "40P01", message: "deadlock detected" }),
      true,
    )
    assert.equal(
      reserveRpcErrorText({ code: "55P03", message: "lock_not_available" }),
      "55P03 lock_not_available",
    )
  })
})
