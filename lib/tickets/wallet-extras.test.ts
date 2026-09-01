import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  inferCheckoutExtraCategory,
  isWalletCheckoutExtra,
  walletAdmissionTickets,
  walletCheckoutExtras,
} from "./wallet-extras"

describe("wallet extras routing", () => {
  it("treats ticket_type extra and tier_type addon as extras", () => {
    assert.equal(
      isWalletCheckoutExtra({ ticketType: "extra", tierType: "general" }),
      true,
    )
    assert.equal(
      isWalletCheckoutExtra({ ticketType: "standard", tierType: "addon" }),
      true,
    )
    assert.equal(
      isWalletCheckoutExtra({ ticketType: "standard", tierType: "general" }),
      false,
    )
    assert.equal(
      isWalletCheckoutExtra({ ticketType: "combo", tierType: "bundle" }),
      false,
    )
  })

  it("splits admission tickets from checkout extras", () => {
    const tickets = [
      { id: "a", ticketType: "standard" as const, tierType: "general" },
      { id: "b", ticketType: "extra" as const, tierType: "addon" },
      { id: "c", ticketType: "standard" as const, tierType: "addon" },
    ]
    assert.deepEqual(
      walletAdmissionTickets(tickets).map((ticket) => ticket.id),
      ["a"],
    )
    assert.deepEqual(
      walletCheckoutExtras(tickets).map((ticket) => ticket.id),
      ["b", "c"],
    )
  })

  it("guesses a store category from the extra name", () => {
    assert.equal(inferCheckoutExtraCategory("Cerveza IPA"), "drinks")
    assert.equal(inferCheckoutExtraCategory("Estacionamiento VIP"), "parking")
    assert.equal(inferCheckoutExtraCategory("Meet & Greet"), "upgrades")
  })
})
