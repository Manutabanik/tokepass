import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { scrubSensitiveValue, scrubSentryEvent } from "./privacy"

describe("sentry privacy", () => {
  it("redacts passwords, tokens and full card numbers", () => {
    const scrubbed = scrubSensitiveValue({
      password: "hunter2",
      access_token: "APP_USR-secret",
      card_number: "4111111111111111",
      orderId: "ok-uuid",
      note: "card 4111 1111 1111 1111",
    }) as Record<string, unknown>

    assert.equal(scrubbed.password, "[Filtered]")
    assert.equal(scrubbed.access_token, "[Filtered]")
    assert.equal(scrubbed.card_number, "[Filtered]")
    assert.equal(scrubbed.orderId, "ok-uuid")
    assert.equal(scrubbed.note, "card [Filtered]")
  })

  it("strips cookies and authorization from request metadata", () => {
    const event = scrubSentryEvent({
      request: {
        cookies: "session=abc",
        headers: {
          Authorization: "Bearer secret",
          "content-type": "application/json",
        },
        data: { card_number: "4111111111111111" },
      },
    })

    assert.equal(event.request?.cookies, undefined)
    assert.equal(event.request?.data, undefined)
    assert.equal(event.request?.headers?.Authorization, "[Filtered]")
    assert.equal(event.request?.headers?.["content-type"], "application/json")
  })
})
