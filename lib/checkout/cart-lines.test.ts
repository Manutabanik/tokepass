import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cartLineDisplayName, cartTicketLineId } from "./cart-lines"

describe("cartLineDisplayName", () => {
  it("appends the compact date in parentheses", () => {
    assert.equal(
      cartLineDisplayName({
        name: "Mesas - Tablon 02",
        dateLabel: "Jue 12 Nov",
      }),
      "Mesas - Tablon 02 (Jue 12 Nov)",
    )
  })

  it("leaves the name unchanged when there is no date", () => {
    assert.equal(
      cartLineDisplayName({ name: "General" }),
      "General",
    )
  })

  it("does not duplicate an existing date suffix", () => {
    assert.equal(
      cartLineDisplayName({
        name: "General (Vie 21 Ago)",
        dateLabel: "Vie 21 Ago",
      }),
      "General (Vie 21 Ago)",
    )
  })
})

describe("cartTicketLineId", () => {
  it("keeps date identity in the line id", () => {
    assert.equal(cartTicketLineId("tier-1", "d1"), "ticket:tier-1__d1")
    assert.equal(cartTicketLineId("tier-1"), "ticket:tier-1__all")
  })
})
