import assert from "node:assert/strict"
import { describe, it, beforeEach } from "node:test"

import {
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_FAILURE_WINDOW_MS,
  CIRCUIT_OPEN_MS,
  CircuitOpenError,
  EXTERNAL_FETCH_TIMEOUT_MS,
  allowCircuit,
  recordCircuitFailure,
  recordCircuitSuccess,
  resetCircuitsForTests,
  withCircuit,
} from "./circuit-breaker"

describe("circuit breaker", () => {
  beforeEach(() => {
    resetCircuitsForTests()
  })

  it("opens after 5 failures in 30 seconds and fail-fasts", async () => {
    const now = Date.now()
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) {
      recordCircuitFailure("resend", now + i)
    }
    assert.equal(allowCircuit("resend", now + 10), false)
    await assert.rejects(
      () => withCircuit("resend", async () => "ok"),
      (error: unknown) => error instanceof CircuitOpenError,
    )
  })

  it("allows a single half-open probe after the open window", () => {
    const openedAt = 2_000_000
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) {
      recordCircuitFailure("mercadopago", openedAt)
    }
    const probeAt = openedAt + CIRCUIT_OPEN_MS
    assert.equal(allowCircuit("mercadopago", probeAt), true)
    assert.equal(allowCircuit("mercadopago", probeAt + 1), false)
  })

  it("closes after a successful probe", async () => {
    const openedAt = 3_000_000
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) {
      recordCircuitFailure("payway", openedAt)
    }
    const probeAt = openedAt + CIRCUIT_OPEN_MS
    assert.equal(allowCircuit("payway", probeAt), true)
    recordCircuitSuccess("payway")
    assert.equal(allowCircuit("payway", probeAt + 1), true)
  })

  it("cuts hung fetches at 8 seconds", () => {
    assert.equal(EXTERNAL_FETCH_TIMEOUT_MS, 8_000)
  })

  it("does not open when older failures fall outside the 30s window", () => {
    const now = 4_000_000
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD - 1; i += 1) {
      recordCircuitFailure("naranjax", now)
    }
    recordCircuitFailure("naranjax", now + CIRCUIT_FAILURE_WINDOW_MS + 1)
    assert.equal(
      allowCircuit("naranjax", now + CIRCUIT_FAILURE_WINDOW_MS + 1),
      true,
    )
  })
})
