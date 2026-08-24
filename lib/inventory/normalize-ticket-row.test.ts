import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { normalizeTicketRow } from "./normalize-ticket-row"

describe("normalizeTicketRow", () => {
  it("coerces string capacity and price to numbers", () => {
    const normalized = normalizeTicketRow({
      name: " General ",
      price: "500" as unknown as number,
      basePrice: "420" as unknown as number,
      capacity: "120" as unknown as number,
      feeStrategy: "pass_to_customer",
      calculationMode: "net_income",
      saleStartsAt: "",
      saleEndsAt: "",
      layoutType: "general",
      tierType: "general",
    })
    assert.equal(normalized.name, "General")
    assert.equal(normalized.price, 500)
    assert.equal(normalized.basePrice, 420)
    assert.equal(normalized.capacity, 120)
  })
})
