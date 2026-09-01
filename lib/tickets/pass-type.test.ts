import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveTicketPassType } from "./pass-type"

describe("resolveTicketPassType", () => {
  it("maps addon extras to access_pass instead of admission", () => {
    assert.equal(
      resolveTicketPassType({
        tierType: "addon",
        ticketType: "standard",
        name: "Meet & Greet",
      }),
      "access_pass",
    )
    assert.equal(
      resolveTicketPassType({
        tierType: "general",
        ticketType: "extra",
        name: "Cerveza",
      }),
      "access_pass",
    )
  })

  it("maps parking extras to parking", () => {
    assert.equal(
      resolveTicketPassType({
        tierType: "addon",
        ticketType: "extra",
        name: "Estacionamiento VIP",
      }),
      "parking",
    )
  })

  it("keeps general tickets as admission", () => {
    assert.equal(
      resolveTicketPassType({
        tierType: "general",
        ticketType: "standard",
        name: "General",
      }),
      "admission",
    )
  })
})
