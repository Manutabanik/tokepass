import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { verifyWebhookSignature } from "./webhook-secret"

describe("verifyWebhookSignature", () => {
  it("fails closed when the secret is missing or blank", () => {
    assert.equal(verifyWebhookSignature("anything", undefined), false)
    assert.equal(verifyWebhookSignature("anything", ""), false)
    assert.equal(verifyWebhookSignature("anything", "   "), false)
  })

  it("rejects a mismatched signature", () => {
    assert.equal(verifyWebhookSignature("wrong", "expected-secret"), false)
  })

  it("accepts an exact match", () => {
    assert.equal(verifyWebhookSignature("expected-secret", "expected-secret"), true)
  })
})
