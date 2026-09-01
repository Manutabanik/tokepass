import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  groupWalletExtraUnits,
  inferCheckoutExtraCategory,
  isWalletCheckoutExtra,
  walletAdmissionTickets,
  walletCheckoutExtras,
  walletExtraBundleTitle,
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

describe("wallet extra bundles", () => {
  it("titles a consolidated extra with the quantity", () => {
    assert.equal(walletExtraBundleTitle("Estacionamiento", 2), "Estacionamiento (x2)")
    assert.equal(
      walletExtraBundleTitle("Consumición de Barra", 101),
      "Consumición de Barra (x101)",
    )
    assert.equal(walletExtraBundleTitle("Cerveza", 1), "Cerveza")
  })

  it("groups identical extras from the same order", () => {
    const bundles = groupWalletExtraUnits([
      {
        id: "a",
        orderId: "ord-1",
        productKey: "item:parking",
        title: "Estacionamiento",
      },
      {
        id: "b",
        orderId: "ord-1",
        productKey: "item:parking",
        title: "Estacionamiento",
      },
      {
        id: "c",
        orderId: "ord-1",
        productKey: "item:beer",
        title: "Cerveza",
      },
      {
        id: "d",
        orderId: "ord-2",
        productKey: "item:parking",
        title: "Estacionamiento",
      },
    ])
    assert.equal(bundles.length, 3)
    const parking = bundles.find((bundle) => bundle.count === 2)
    assert.equal(parking?.title, "Estacionamiento (x2)")
    assert.deepEqual(
      parking?.items.map((item) => item.id),
      ["a", "b"],
    )
  })

  it("does not merge extras without an order id", () => {
    const bundles = groupWalletExtraUnits([
      { id: "a", orderId: null, productKey: "item:beer", title: "Cerveza" },
      { id: "b", orderId: null, productKey: "item:beer", title: "Cerveza" },
    ])
    assert.equal(bundles.length, 2)
  })
})
