import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CHECKOUT_FEEDBACK_CODE,
  CHECKOUT_NO_STOCK_INLINE,
  CHECKOUT_NO_STOCK_TOAST,
  inferCheckoutTicketId,
  resolveCheckoutFeedback,
} from "./checkout-feedback"
import {
  ERR_NO_STOCK,
  GENERAL_STOCK_UNAVAILABLE,
  SEAT_UNAVAILABLE,
  encodeGeneralStockUnavailable,
  parseGeneralStockParts,
} from "./revalidate-seat-holds"

const TIER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

describe("checkout feedback", () => {
  it("maps stock codes to a compact toast and inline copy", () => {
    const fromLegacy = resolveCheckoutFeedback("out_of_stock")
    assert.equal(fromLegacy.code, CHECKOUT_FEEDBACK_CODE.ERR_NO_STOCK)
    assert.equal(fromLegacy.message, CHECKOUT_NO_STOCK_TOAST)
    assert.equal(fromLegacy.inlineMessage, CHECKOUT_NO_STOCK_INLINE)

    const fromEncoded = resolveCheckoutFeedback(
      encodeGeneralStockUnavailable("Entrada General", TIER_ID),
      { code: ERR_NO_STOCK, ticketId: TIER_ID },
    )
    assert.equal(fromEncoded.code, CHECKOUT_FEEDBACK_CODE.ERR_NO_STOCK)
    assert.equal(fromEncoded.ticketId, TIER_ID)
    assert.equal(fromEncoded.ticketName, "Entrada General")
  })

  it("keeps seat collisions distinct from sold-out banners", () => {
    const taken = resolveCheckoutFeedback(SEAT_UNAVAILABLE)
    assert.equal(taken.code, CHECKOUT_FEEDBACK_CODE.ERR_SEAT_TAKEN)
    assert.notEqual(taken.message, CHECKOUT_NO_STOCK_TOAST)
  })

  it("parses a ticket id without leaking it into the user message", () => {
    const encoded = encodeGeneralStockUnavailable("Campo", TIER_ID)
    assert.equal(encoded.startsWith(`${ERR_NO_STOCK}:${TIER_ID}`), true)
    const parts = parseGeneralStockParts(encoded)
    assert.equal(parts?.ticketId, TIER_ID)
    assert.equal(parts?.name, "Campo")
    assert.equal(parseGeneralStockParts(GENERAL_STOCK_UNAVAILABLE)?.ticketId, undefined)
  })

  it("infers the highlighted ticket from the cart when the id is missing", () => {
    const id = inferCheckoutTicketId(
      resolveCheckoutFeedback("out_of_stock"),
      [
        { id: TIER_ID, name: "General" },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "VIP" },
      ],
      { [TIER_ID]: 2 },
    )
    assert.equal(id, TIER_ID)
  })
})
