import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { shouldKeepOwnedWalletTicket } from "./wallet-visibility"

describe("shouldKeepOwnedWalletTicket", () => {
  it("keeps a valid paid ticket", () => {
    assert.equal(
      shouldKeepOwnedWalletTicket({
        status: "valid",
        orderId: "o1",
        orderStatus: "paid",
      }),
      true,
    )
  })

  it("keeps a valid ticket when the order embed is missing", () => {
    assert.equal(
      shouldKeepOwnedWalletTicket({
        status: "valid",
        orderId: "o1",
        orderStatus: null,
      }),
      true,
    )
  })

  it("hides unpaid reservations", () => {
    assert.equal(
      shouldKeepOwnedWalletTicket({
        status: "valid",
        orderId: "o1",
        orderStatus: "pending",
      }),
      false,
    )
  })

  it("hides unpaid pending_payment tickets", () => {
    assert.equal(
      shouldKeepOwnedWalletTicket({ status: "pending_payment" }),
      false,
    )
  })

  it("keeps pending_payment tickets once the order is paid", () => {
    assert.equal(
      shouldKeepOwnedWalletTicket({
        status: "pending_payment",
        orderId: "o1",
        orderStatus: "paid",
      }),
      true,
    )
  })
})
