import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isTicketSoldOut, selectableTicketStock } from "./ticket-stock"

describe("selectableTicketStock", () => {
  it("treats missing or invalid available as zero", () => {
    assert.equal(selectableTicketStock({}), 0)
    assert.equal(selectableTicketStock({ available: Number.NaN }), 0)
    assert.equal(isTicketSoldOut({ available: undefined }), true)
  })

  it("never lets the plus button exceed capacity minus sold", () => {
    assert.equal(
      selectableTicketStock({ available: 8, capacity: 10, sold: 10 }),
      0,
    )
    assert.equal(
      selectableTicketStock({ available: 4, capacity: 10, sold: 7 }),
      3,
    )
  })

  it("keeps live available when it is already tighter than capacity", () => {
    assert.equal(
      selectableTicketStock({ available: 2, capacity: 100, sold: 10 }),
      2,
    )
  })
})
