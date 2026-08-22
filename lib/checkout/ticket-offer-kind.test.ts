import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isComboOrPassOffer,
  publicTicketOfferKind,
} from "@/lib/checkout/ticket-offer-kind"

describe("publicTicketOfferKind", () => {
  it("keeps ordinary tickets as SINGLE_DAY even without day_id", () => {
    assert.equal(
      publicTicketOfferKind({ name: "General", dayId: null, tierType: "general" }),
      "SINGLE_DAY",
    )
    assert.equal(
      isComboOrPassOffer({ name: "VIP", dayId: null, tierType: "general" }),
      false,
    )
  })

  it("classifies combos and passes from type, not from empty tabs", () => {
    assert.equal(
      publicTicketOfferKind({
        name: "Pack 2x1",
        dayId: "d1",
        tierType: "bundle",
        bundleType: "cross_sell_pack",
      }),
      "COMBO",
    )
    assert.equal(
      publicTicketOfferKind({
        name: "Abono 3 días",
        dayId: null,
        tierType: "bundle",
        bundleType: "multi_day_pass",
      }),
      "PASS",
    )
  })
})
