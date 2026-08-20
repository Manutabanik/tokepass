import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { notificationOutboxBackoffSeconds } from "@/lib/notifications/outbox-backoff"

describe("notification outbox backoff", () => {
  it("crece en potencia de 2 y tope 300s", () => {
    assert.equal(notificationOutboxBackoffSeconds(1), 2)
    assert.equal(notificationOutboxBackoffSeconds(2), 4)
    assert.equal(notificationOutboxBackoffSeconds(6), 64)
    assert.equal(notificationOutboxBackoffSeconds(8), 256)
    assert.equal(notificationOutboxBackoffSeconds(9), 300)
    assert.equal(notificationOutboxBackoffSeconds(12), 300)
  })
})
