import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  preferenceIdFromOrder,
  selectStalePreferenceOrders,
} from "@/lib/payments/stale-preference-select"

describe("stale Mercado Pago preferences", () => {
  it("selects pending and expired orders with a preference except the live one", () => {
    const live = "11111111-1111-4111-8111-111111111111"
    const stalePending = {
      id: "22222222-2222-4222-8222-222222222222",
      status: "pending",
      mp_preference_id: "pref-old",
    }
    const staleExpired = {
      id: "33333333-3333-4333-8333-333333333333",
      status: "expired",
      provider_preference_id: "pref-expired",
    }
    const paid = {
      id: "44444444-4444-4444-8444-444444444444",
      status: "paid",
      mp_preference_id: "pref-paid",
    }
    const keep = {
      id: live,
      status: "pending",
      mp_preference_id: "pref-live",
    }

    const selected = selectStalePreferenceOrders(
      [keep, stalePending, staleExpired, paid],
      live,
    )
    assert.deepEqual(
      selected.map((row) => row.id).sort(),
      [stalePending.id, staleExpired.id].sort(),
    )
    assert.equal(preferenceIdFromOrder(stalePending), "pref-old")
  })
})
