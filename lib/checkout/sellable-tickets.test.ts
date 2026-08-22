import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  hasSellablePublicTickets,
  isSellablePublicTicket,
  startingPriceFromSellable,
} from "./sellable-tickets"

const now = new Date("2026-08-22T15:00:00-03:00")

describe("sellable public tickets", () => {
  it("keeps a public ticket with stock whose sale already started", () => {
    assert.equal(
      isSellablePublicTicket(
        {
          price: 15000,
          available: 40,
          capacity: 100,
          sold: 60,
          visibility: "public",
          saleStartsAt: "2026-08-01T10:00:00-03:00",
          tier_type: "general",
        },
        now,
      ),
      true,
    )
  })

  it("rejects private, sold-out, upcoming, and addon tickets", () => {
    assert.equal(
      isSellablePublicTicket(
        { price: 1000, available: 10, visibility: "private", tier_type: "general" },
        now,
      ),
      false,
    )
    assert.equal(
      isSellablePublicTicket(
        { price: 1000, available: 0, capacity: 10, sold: 10, tier_type: "general" },
        now,
      ),
      false,
    )
    assert.equal(
      isSellablePublicTicket(
        {
          price: 1000,
          available: 10,
          saleStartsAt: "2026-09-01T10:00:00-03:00",
          tier_type: "general",
        },
        now,
      ),
      false,
    )
    assert.equal(
      isSellablePublicTicket(
        { price: 2000, available: 80, visibility: "public", tier_type: "addon" },
        now,
      ),
      false,
    )
  })

  it("requires ACTIVE status and remaining stock_available", () => {
    assert.equal(
      isSellablePublicTicket(
        {
          price: 12000,
          stock_available: 8,
          visibility: "public",
          status: "ACTIVE",
          tier_type: "general",
        },
        now,
      ),
      true,
    )
    assert.equal(
      isSellablePublicTicket(
        {
          price: 12000,
          stock_available: 8,
          visibility: "public",
          status: "inactive",
          tier_type: "general",
        },
        now,
      ),
      false,
    )
    assert.equal(
      isSellablePublicTicket(
        {
          price: 12000,
          stock_available: 0,
          visibility: "public",
          status: "ACTIVE",
          tier_type: "general",
        },
        now,
      ),
      false,
    )
    assert.equal(
      isSellablePublicTicket(
        {
          price: 12000,
          available: 10,
          isActive: false,
          tier_type: "general",
        },
        now,
      ),
      false,
    )
  })

  it("uses the cheapest sellable admission price, never an addon", () => {
    assert.equal(
      startingPriceFromSellable(
        [
          {
            price: 5000,
            available: 20,
            visibility: "public",
            tier_type: "addon",
            category: "special",
          },
          {
            price: 18000,
            available: 40,
            visibility: "public",
            tier_type: "general",
          },
        ],
        now,
      ),
      18000,
    )
    assert.equal(
      hasSellablePublicTickets(
        [{ price: 5000, available: 20, visibility: "public", tier_type: "addon" }],
        now,
      ),
      false,
    )
  })
})
