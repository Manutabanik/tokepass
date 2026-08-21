import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { generalTicketMaxQuantity } from "./general-ticket-quantity"

describe("generalTicketMaxQuantity", () => {
  it("caps by lot stock and the SKU max, not a shared cart sum", () => {
    const max = generalTicketMaxQuantity({
      tier: {
        id: "early",
        available: 8,
        layoutType: "general",
        seatingSectorId: "general:pista",
        maxPurchaseLimit: 6,
      },
      siblings: [
        {
          id: "early",
          available: 8,
          seatingSectorId: "general:pista",
        },
      ],
      quantities: {},
      selectedCount: 4,
      maxTicketsPerUser: 10,
    })
    assert.equal(max, 6)
  })

  it("caps by remaining stock of the shared logical sector", () => {
    const max = generalTicketMaxQuantity({
      tier: {
        id: "early",
        available: 10,
        layoutType: "general",
        seatingSectorId: "general:pista",
      },
      siblings: [
        {
          id: "early",
          available: 10,
          seatingSectorId: "general:pista",
        },
        {
          id: "general",
          available: 4,
          seatingSectorId: "general:pista",
        },
      ],
      quantities: { general: 8 },
      selectedCount: 8,
      maxTicketsPerUser: 20,
    })
    assert.equal(max, 6)
  })
})
