import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  WEBHOOK_QUEUE_MAX_ATTEMPTS,
  webhookFailureStatus,
} from "./webhook-queue-status"

describe("webhook queue failure status", () => {
  it("stays failed before the 12th attempt", () => {
    assert.equal(webhookFailureStatus(11), "failed")
  })

  it("marks dead at 12 attempts", () => {
    assert.equal(WEBHOOK_QUEUE_MAX_ATTEMPTS, 12)
    assert.equal(webhookFailureStatus(12), "dead")
    assert.equal(webhookFailureStatus(13), "dead")
  })
})
