import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  getSentryReplaySessionSampleRate,
  getSentryTracesSampleRate,
} from "@/lib/sentry/options"
import {
  withSentryAction,
  withSentryActionSafe,
} from "@/lib/sentry-wrapper"

describe("sentry sample rates", () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it("usa cuotas bajas en producción", () => {
    process.env.NODE_ENV = "production"
    assert.equal(getSentryTracesSampleRate(), 0.1)
    assert.equal(getSentryReplaySessionSampleRate(), 0.05)
  })

  it("usa muestreo completo fuera de producción", () => {
    process.env.NODE_ENV = "development"
    assert.equal(getSentryTracesSampleRate(), 1.0)
    assert.equal(getSentryReplaySessionSampleRate(), 1.0)
  })
})

describe("withSentryAction", () => {
  it("relanza la excepción original", async () => {
    const wrapped = withSentryAction("test.action", async () => {
      throw new Error("boom")
    })

    await assert.rejects(() => wrapped(), /boom/)
  })

  it("devuelve el resultado cuando la acción tiene éxito", async () => {
    const wrapped = withSentryAction("test.ok", async (value: number) => ({
      ok: true,
      value,
    }))

    const result = await wrapped(7)
    assert.deepEqual(result, { ok: true, value: 7 })
  })
})

describe("withSentryActionSafe", () => {
  it("devuelve un error seguro para el cliente", async () => {
    const wrapped = withSentryActionSafe("test.safe", async () => {
      throw new Error("SEATING_TIER_CONFIG_AMBIGUOUS: General")
    })

    const result = await wrapped()
    assert.ok(result && "error" in result)
    assert.equal(typeof result.error, "string")
    assert.ok(result.error.length > 0)
  })
})
