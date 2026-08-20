import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapGatewayPaymentStatus } from "./map-gateway-status"

describe("mapGatewayPaymentStatus", () => {
  it("does not map charged_back to rejected", () => {
    assert.equal(mapGatewayPaymentStatus("charged_back"), "charged_back")
    assert.equal(mapGatewayPaymentStatus("chargeback"), "charged_back")
  })

  it("keeps in_mediation and refunded distinct from rejected", () => {
    assert.equal(mapGatewayPaymentStatus("in_mediation"), "in_mediation")
    assert.equal(mapGatewayPaymentStatus("refunded"), "refunded")
    assert.equal(mapGatewayPaymentStatus("rejected"), "rejected")
  })
})
