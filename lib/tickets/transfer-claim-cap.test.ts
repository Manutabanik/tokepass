import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { shouldEnforceTransferTicketCap } from "./transfer-claim-cap"

describe("shouldEnforceTransferTicketCap", () => {
  it("omite el tope si la entrada es de prueba", () => {
    assert.equal(
      shouldEnforceTransferTicketCap({
        ticketIsTest: true,
        eventStatus: "published",
        receiverRole: "customer",
      }),
      false,
    )
  })

  it("omite el tope si el evento no esta publicado", () => {
    assert.equal(
      shouldEnforceTransferTicketCap({
        ticketIsTest: false,
        eventStatus: "draft",
        receiverRole: "customer",
      }),
      false,
    )
  })

  it("omite el tope para admin y super_admin", () => {
    assert.equal(
      shouldEnforceTransferTicketCap({
        ticketIsTest: false,
        eventStatus: "published",
        receiverRole: "admin",
      }),
      false,
    )
    assert.equal(
      shouldEnforceTransferTicketCap({
        ticketIsTest: false,
        eventStatus: "published",
        receiverRole: "super_admin",
      }),
      false,
    )
  })

  it("aplica el tope a una entrada real de un evento publicado", () => {
    assert.equal(
      shouldEnforceTransferTicketCap({
        ticketIsTest: false,
        eventStatus: "published",
        receiverRole: "customer",
      }),
      true,
    )
  })
})
