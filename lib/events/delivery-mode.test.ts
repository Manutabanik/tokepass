import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  eventAccessTimeLabel,
  isOnlineDelivery,
  normalizeAccessLink,
  parseDeliveryMode,
} from "@/lib/events/delivery-mode"

describe("delivery-mode", () => {
  it("defaults unknown values to PRESENCIAL", () => {
    assert.equal(parseDeliveryMode(null), "PRESENCIAL")
    assert.equal(parseDeliveryMode("online"), "PRESENCIAL")
    assert.equal(parseDeliveryMode("ONLINE"), "ONLINE")
  })

  it("accepts http(s) access links and rejects junk", () => {
    assert.equal(
      normalizeAccessLink("https://zoom.us/j/123"),
      "https://zoom.us/j/123",
    )
    assert.equal(normalizeAccessLink("javascript:alert(1)"), null)
    assert.equal(normalizeAccessLink("   "), null)
  })

  it("labels door vs stream start", () => {
    assert.equal(eventAccessTimeLabel("PRESENCIAL"), "Puertas")
    assert.equal(eventAccessTimeLabel("ONLINE"), "Inicio de transmisión")
    assert.equal(isOnlineDelivery("ONLINE"), true)
  })
})
