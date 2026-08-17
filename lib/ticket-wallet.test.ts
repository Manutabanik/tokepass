import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ticketOrdinalInGroup, ticketOrdinalLabel } from "@/lib/ticket-wallet"

describe("ticket wallet ordinals", () => {
  it("labels several tickets of the same tier", () => {
    assert.equal(ticketOrdinalLabel("General", 0, 4), "General - Entrada 1 de 4")
    assert.equal(ticketOrdinalLabel("General", 3, 4), "General - Entrada 4 de 4")
  })

  it("keeps a single ticket without the N de M suffix", () => {
    assert.equal(ticketOrdinalLabel("VIP", 0, 1), "VIP")
  })

  it("numbers within the same tier of an event group", () => {
    const tickets = [
      { id: "a", tierName: "General" },
      { id: "b", tierName: "VIP" },
      { id: "c", tierName: "General" },
    ]
    assert.equal(
      ticketOrdinalInGroup(tickets, tickets[2]!).label,
      "General - Entrada 2 de 2",
    )
    assert.equal(ticketOrdinalInGroup(tickets, tickets[1]!).label, "VIP")
  })
})
