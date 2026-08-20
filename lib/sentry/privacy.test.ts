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

  it("redacts dni, email, phone and holder fields without touching to_hash", () => {
    const scrubbed = scrubSensitiveValue({
      dni: "30111222",
      cuil: "20301112227",
      email: "ana@example.com",
      to: "ana@example.com",
      to_hash: "abc123def4567890",
      phone: "1144445555",
      telefono: "1144445555",
      holder_email: "ana@example.com",
      holder_name: "Ana Perez",
      holder_dni: "30111222",
      orderId: "ok-uuid",
    }) as Record<string, unknown>

    assert.equal(scrubbed.dni, "[Filtered]")
    assert.equal(scrubbed.cuil, "[Filtered]")
    assert.equal(scrubbed.email, "[Filtered]")
    assert.equal(scrubbed.to, "[Filtered]")
    assert.equal(scrubbed.to_hash, "abc123def4567890")
    assert.equal(scrubbed.phone, "[Filtered]")
    assert.equal(scrubbed.telefono, "[Filtered]")
    assert.equal(scrubbed.holder_email, "[Filtered]")
    assert.equal(scrubbed.holder_name, "[Filtered]")
    assert.equal(scrubbed.holder_dni, "[Filtered]")
    assert.equal(scrubbed.orderId, "ok-uuid")
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
