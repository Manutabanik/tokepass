import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  GUEST_TICKET_CAP_ERROR,
  generateGuestOrderToken,
  guestTicketCapExceeded,
  guestTicketUrl,
  isGuestOrderToken,
  uniqueTicketCount,
} from "@/lib/checkout/guest-token"

describe("guest order token and ticket cap", () => {
  it("creates a 32-byte hex token", () => {
    const token = generateGuestOrderToken()
    assert.equal(token.length, 64)
    assert.equal(isGuestOrderToken(token), true)
    assert.equal(isGuestOrderToken("short"), false)
    assert.equal(
      guestTicketUrl("ab".repeat(32), "https://tokepass.com.ar"),
      `https://tokepass.com.ar/entrada/invitado/${"ab".repeat(32)}`,
    )
  })

  it("blocks when DNI/email already holds the event maximum", () => {
    assert.equal(guestTicketCapExceeded(3, 2, 4), true)
    assert.equal(guestTicketCapExceeded(2, 2, 4), false)
    assert.equal(uniqueTicketCount([{ id: "a" }, { id: "a" }, { id: "b" }]), 2)
    assert.equal(
      guestTicketCapExceeded(1, 1, 1),
      true,
    )
    assert.equal(
      GUEST_TICKET_CAP_ERROR,
      "Superaste el límite máximo de entradas permitidas por persona.",
    )
  })
})
