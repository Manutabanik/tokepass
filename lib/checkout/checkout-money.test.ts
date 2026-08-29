import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clientCheckoutMoneyMatchesQuoted,
  orderLedgerFromQuote,
  quoteCheckoutMoney,
} from "./checkout-money"

describe("quoteCheckoutMoney", () => {
  it("registers ticketPrice, feeAmount and customerTotal when the fee is passed through", () => {
    const quote = quoteCheckoutMoney([{ price: 10000, quantity: 2 }], {
      rate: 0.1,
      fixedFee: 200,
      absorbFees: false,
    })
    assert.equal(quote.ticketPrice, 20000)
    assert.equal(quote.feeAmount, 2400)
    assert.equal(quote.customerTotal, 22400)
    assert.equal(quote.grandTotal, 22400)
    assert.equal(quote.ticketAmount, 20000)
    assert.deepEqual(orderLedgerFromQuote(quote), {
      subtotal: 20000,
      service_charge: 2400,
      total_amount: 22400,
    })
  })

  it("accepts the client split only when it matches the server quote", () => {
    const server = quoteCheckoutMoney([{ price: 10000, quantity: 1 }], {
      rate: 0.1,
      absorbFees: false,
    })
    assert.equal(
      clientCheckoutMoneyMatchesQuoted(
        {
          ticketPrice: 10000,
          feeAmount: 1000,
          customerTotal: 11000,
          grandTotal: 11000,
        },
        server,
      ),
      true,
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
      false,
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
