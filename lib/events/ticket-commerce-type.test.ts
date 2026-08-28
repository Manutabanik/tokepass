import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  asTicketCommerceType,
  isUndatedCheckoutOffer,
  partitionCheckoutTickets,
  resolveTicketCommerceType,
} from "./ticket-commerce-type"

describe("ticket commerce type", () => {
  it("keeps an explicit ticketType over inventory heuristics", () => {
    assert.equal(
      resolveTicketCommerceType({
        ticketType: "combo",
        tierType: "addon",
        name: "Estacionamiento",
      }),
      "combo",
    )
    assert.equal(asTicketCommerceType("EXTRA"), "extra")
    assert.equal(asTicketCommerceType("otro"), "standard")
  })

  it("infers extras and combos when the column is missing", () => {
    assert.equal(
      resolveTicketCommerceType({ tierType: "addon", name: "Estacionamiento" }),
      "extra",
    )
    assert.equal(
      resolveTicketCommerceType({
        tierType: "bundle",
        bundleType: "cross_sell_pack",
        name: "Combo VIP",
      }),
      "combo",
    )
    assert.equal(
      resolveTicketCommerceType({ name: "General", tierType: "general" }),
      "standard",
    )
  })

  it("partitions the buyer catalog into standard, combo and extra", () => {
    const grouped = partitionCheckoutTickets([
      { id: "a", ticketType: "standard" },
      { id: "b", ticketType: "combo" },
      { id: "c", ticketType: "extra" },
      { id: "d", tierType: "addon" },
    ])
    assert.deepEqual(
      grouped.standardTickets.map((item) => item.id),
      ["a"],
    )
    assert.deepEqual(
      grouped.comboTickets.map((item) => item.id),
      ["b"],
    )
    assert.deepEqual(
      grouped.extraTickets.map((item) => item.id),
      ["c", "d"],
    )
  })

  it("treats extras and combos as undated, not jornada-scoped generals", () => {
    assert.equal(isUndatedCheckoutOffer({ name: "General", tierType: "general" }), false)
    assert.equal(isUndatedCheckoutOffer({ ticketType: "extra" }), true)
    assert.equal(isUndatedCheckoutOffer({ ticketType: "combo" }), true)
  })
})
