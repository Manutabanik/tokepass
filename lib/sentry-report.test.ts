import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { reportErrorToSentry } from "./sentry-report"

describe("sentry-report", () => {
  it("no-ops without SENTRY_DSN", () => {
    const prev = process.env.SENTRY_DSN
    delete process.env.SENTRY_DSN
    assert.doesNotThrow(() => {
      reportErrorToSentry({
        message: "test",
        context: "unit",
      })
    })
    if (prev) process.env.SENTRY_DSN = prev
  })
})
