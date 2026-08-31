import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertCartHasAdmissionSku,
  assertLoadedCheckoutTiersCoverCart,
  cartIncludesAdmissionSku,
  CHECKOUT_TIERS_UNREADABLE_ERROR,
  EXTRAS_REQUIRE_ADMISSION_ERROR,
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

  it("keeps a free public ticket with price 0", () => {
    assert.equal(
      isSellablePublicTicket(
        {
          price: 0,
          available: 20,
          visibility: "public",
          tier_type: "general",
        },
        now,
      ),
      true,
    )
    assert.equal(
      startingPriceFromSellable(
        [{ price: 0, available: 20, visibility: "public", tier_type: "general" }],
        now,
      ),
      0,
    )
  })

  it("rejects extras even when inventory still looks like a general ticket", () => {
    assert.equal(
      isSellablePublicTicket(
        {
          price: 2500,
          available: 40,
          visibility: "public",
          ticket_type: "extra",
          tier_type: "general",
        },
        now,
      ),
      false,
    )
    assert.equal(
      isSellablePublicTicket(
        {
          price: 2500,
          available: 40,
          visibility: "public",
          category: "special",
        },
        now,
      ),
      false,
    )
  })

  it("adds the transferred service fee to the public starting price", () => {
    assert.equal(
      startingPriceFromSellable(
        [
          {
            price: 15000,
            available: 20,
            visibility: "public",
            tier_type: "general",
          },
        ],
        now,
        { rate: 0.08, fixedFee: 200, absorbFees: false },
      ),
      16400,
    )
    assert.equal(
      startingPriceFromSellable(
        [
          {
            price: 15000,
            available: 20,
            visibility: "public",
            tier_type: "general",
          },
        ],
        now,
        { rate: 0.08, fixedFee: 200, absorbFees: true },
      ),
      15000,
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

  it("rejects a cart that only has extras", () => {
    assert.equal(cartIncludesAdmissionSku([{ ticket_type: "extra" }]), false)
    assert.equal(
      cartIncludesAdmissionSku([
        { ticket_type: "extra" },
        { ticket_type: "standard" },
      ]),
      true,
    )
    assert.equal(cartIncludesAdmissionSku([{ ticket_type: "combo" }]), true)
    assert.equal(
      cartIncludesAdmissionSku([{ tier_type: "addon", category: "special" }]),
      false,
    )
    assert.equal(
      cartIncludesAdmissionSku([
        { ticket_type: "standard", tier_type: "addon", name: "Cerveza" },
      ]),
      false,
    )
    assert.deepEqual(assertCartHasAdmissionSku(1, []), {
      ok: false,
      error: CHECKOUT_TIERS_UNREADABLE_ERROR,
    })
    assert.deepEqual(
      assertCartHasAdmissionSku(1, [{ ticket_type: "extra" }]),
      { ok: false, error: EXTRAS_REQUIRE_ADMISSION_ERROR },
    )
    assert.deepEqual(
      assertCartHasAdmissionSku(2, [
        { ticket_type: "extra" },
        { ticket_type: "standard" },
      ]),
      { ok: true },
    )
    assert.deepEqual(
      assertLoadedCheckoutTiersCoverCart(
        ["adm", "extra"],
        [{ id: "adm", ticket_type: "standard" }],
      ),
      { ok: false, error: CHECKOUT_TIERS_UNREADABLE_ERROR },
    )
    assert.deepEqual(
      assertLoadedCheckoutTiersCoverCart(
        ["adm", "extra"],
        [
          { id: "adm", ticket_type: "standard" },
          { id: "extra", ticket_type: "extra" },
        ],
      ),
      { ok: true },
    )
  })
})
