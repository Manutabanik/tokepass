import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  calculateCartPriceBreakdown,
  calculateTotal,
  cartIncludedServiceFee,
  cartLineUnitMoney,
  cartItemCount,
  cartQuantityCount,
  hasActiveCheckoutSelection,
  includedServiceFee,
  sumCartAmounts,
  sumCartQuantities,
  toCartNumber,
} from "./cart"

describe("checkout cart selection", () => {
  it("counts quantity tiers and a numbered seat as active selection", () => {
    assert.equal(cartItemCount({}, false), 0)
    assert.equal(hasActiveCheckoutSelection({ general: 0 }, false), false)
    assert.equal(cartItemCount({ general: 2 }, false), 2)
    assert.equal(cartItemCount({ general: 2 }, true), 3)
    assert.equal(hasActiveCheckoutSelection({}, true), true)
  })

  it("counts free $0 tickets the same as paid tickets", () => {
    assert.equal(cartQuantityCount({ lima: 1 }), 1)
    assert.equal(cartQuantityCount({ lima: 1, pullman: 0 }), 1)
    assert.equal(hasActiveCheckoutSelection({ lima: 1 }, false), true)
  })
})

describe("calculateTotal", () => {
  it("sums stamped price times quantity including Gratis", () => {
    assert.equal(
      calculateTotal([
        { price: 0, quantity: 2 },
        { price: 15000, quantity: 1 },
      ]),
      15000,
    )
    assert.equal(calculateTotal([{ price: 0, quantity: 3 }]), 0)
  })
})

describe("cart math", () => {
  it("sums line quantities instead of unique line ids", () => {
    assert.equal(
      sumCartQuantities([
        { quantity: 2 },
        { quantity: "3" },
        { quantity: 0 },
      ]),
      5,
    )
  })

  it("multiplies unit price by quantity with numeric coercion", () => {
    assert.equal(
      sumCartAmounts([
        { price: "50000", quantity: "2" },
        { price: 10000, quantity: 1 },
      ]),
      110000,
    )
  })

  it("computes an included 10% service fee from the subtotal", () => {
    assert.equal(includedServiceFee(100000, 0.1), 10000)
    assert.equal(includedServiceFee("100000", 10), 10000)
    assert.equal(toCartNumber("10"), 10)
  })

  it("computes the transferred service fee from the entered ticket price", () => {
    const lines = [
      { price: 10000, quantity: 2 },
      { price: 0, quantity: 1 },
    ]
    assert.equal(cartIncludedServiceFee(lines, 0.1), 2000)
    assert.equal(cartIncludedServiceFee(lines, 0.1, 200), 2400)
    assert.equal(calculateTotal(lines), 20000)
  })

  it("rounds stamped line math in integer cents", () => {
    assert.equal(
      calculateTotal([
        { price: 10.005, quantity: 1 },
        { price: 10.005, quantity: 1 },
      ]),
      20.02,
    )
  })
})

describe("calculateCartPriceBreakdown", () => {
  it("adds the fee on top when absorb_fees is false", () => {
    const lines = [
      { price: 10000, quantity: 2 },
      { price: 5000, quantity: 1 },
    ]
    const quote = calculateCartPriceBreakdown(lines, {
      rate: 0.1,
      absorbFees: false,
    })
    assert.equal(quote.ticketPrice, 25000)
    assert.equal(quote.feeAmount, 2500)
    assert.equal(quote.customerTotal, 27500)
    assert.equal(quote.grandTotal, 27500)
    assert.equal(quote.serviceFee, cartIncludedServiceFee(lines, 0.1))
  })

  it("keeps the entered price as the charge when absorb_fees is true", () => {
    const one = calculateCartPriceBreakdown([{ price: 10000, quantity: 1 }], {
      rate: 0.1,
      absorbFees: true,
    })
    const two = calculateCartPriceBreakdown([{ price: 10000, quantity: 2 }], {
      rate: 0.1,
      absorbFees: true,
    })
    assert.equal(one.ticketPrice, 10000)
    assert.equal(one.feeAmount, 1000)
    assert.equal(one.customerTotal, 10000)
    assert.equal(one.ticketPrice - one.feeAmount, 9000)
    assert.equal(two.ticketPrice, 20000)
    assert.equal(two.feeAmount, 2000)
    assert.equal(two.grandTotal, 20000)
  })

  it("keeps a zero quote when the cart is empty or free", () => {
    assert.deepEqual(calculateCartPriceBreakdown([], { rate: 0.1, fixedFee: 200 }), {
      ticketPrice: 0,
      subtotal: 0,
      baseAmount: 0,
      serviceFee: 0,
      feeAmount: 0,
      customerTotal: 0,
      grandTotal: 0,
      absorbFees: false,
    })
    assert.deepEqual(
      calculateCartPriceBreakdown([{ price: 0, quantity: 3 }], {
        rate: 10,
        fixedFee: 200,
      }),
      {
        ticketPrice: 0,
        subtotal: 0,
        baseAmount: 0,
        serviceFee: 0,
        feeAmount: 0,
        customerTotal: 0,
        grandTotal: 0,
        absorbFees: false,
      },
    )
  })

  it("stamps each line with ticketPrice, feeAmount and customerTotal", () => {
    const passed = cartLineUnitMoney(10000, {
      rate: 0.1,
      fixedFee: 200,
      absorbFees: false,
    })
    assert.equal(passed.ticketPrice, 10000)
    assert.equal(passed.feeAmount, 1200)
    assert.equal(passed.customerTotal, 11200)
    assert.equal(passed.totalPrice, 11200)
    assert.equal(passed.absorbFees, false)

    const absorbed = cartLineUnitMoney(10000, {
      rate: 0.1,
      absorbFees: true,
    })
    assert.equal(absorbed.customerTotal, 10000)
    assert.equal(absorbed.feeAmount, 1000)
    assert.equal(absorbed.absorbFees, true)
  })
})
