import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clientCheckoutMoneyMatchesQuoted,
  orderLedgerFromQuote,
  quoteCheckoutMoney,
} from "./checkout-money"

describe("quoteCheckoutMoney", () => {
  it("splits All-In public prices into ticket_amount and fee_amount without raising the charge", () => {
    const quote = quoteCheckoutMoney([{ price: 10000, quantity: 2 }], {
      rate: 0.1,
      fixedFee: 200,
    })
    assert.equal(quote.subtotal, 20000)
    assert.equal(quote.grandTotal, 20000)
    assert.equal(quote.total, 20000)
    assert.equal(quote.serviceFee, 2400)
    assert.equal(quote.feeAmount, 2400)
    assert.equal(quote.ticketAmount, 17600)
    assert.deepEqual(orderLedgerFromQuote(quote), {
      subtotal: 20000,
      service_charge: 2400,
      total_amount: 20000,
    })
  })

  it("rejects a client grandTotal that added the service fee twice", () => {
    const server = quoteCheckoutMoney([{ price: 10000, quantity: 1 }], {
      rate: 0.1,
    })
    assert.equal(
      clientCheckoutMoneyMatchesQuoted(
        { subtotal: 10000, serviceFee: 1000, grandTotal: 11000 },
        server,
      ),
      false,
    )
    assert.equal(
      clientCheckoutMoneyMatchesQuoted(
        {
          subtotal: 10000,
          serviceFee: 1000,
          grandTotal: 10000,
          displayedTotal: 10000,
        },
        server,
      ),
      true,
    )
  })

  it("skips the pre-promo total when a coupon will recalculate the charge", () => {
    const server = quoteCheckoutMoney([{ price: 10000, quantity: 1 }], {
      rate: 0.1,
    })
    assert.equal(
      clientCheckoutMoneyMatchesQuoted(
        { displayedTotal: 8000, grandTotal: 8000 },
        server,
        { skipPrePromoTotal: true },
      ),
      true,
    )
  })
})
