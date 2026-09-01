import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  classifyIssuanceForDashboard,
  digitalRemaining,
  issuanceUsesDigitalStock,
  issuanceUsesPhysicalStock,
  physicalRemaining,
} from "./channel-stock"

describe("channel stock buckets", () => {
  it("keeps web, POS and complimentary on the digital bucket", () => {
    assert.equal(issuanceUsesDigitalStock("online"), true)
    assert.equal(issuanceUsesDigitalStock("pos"), true)
    assert.equal(issuanceUsesDigitalStock("complimentary"), true)
    assert.equal(issuanceUsesDigitalStock(null), true)
    assert.equal(issuanceUsesDigitalStock("batch_print"), false)
    assert.equal(issuanceUsesDigitalStock("accreditation"), false)
  })

  it("isolates batch_print on the physical bucket", () => {
    assert.equal(issuanceUsesPhysicalStock("batch_print"), true)
    assert.equal(issuanceUsesPhysicalStock("online"), false)
    assert.equal(issuanceUsesPhysicalStock("complimentary"), false)
  })

  it("splits dashboard KPIs as web vs paper", () => {
    assert.equal(classifyIssuanceForDashboard("online"), "web")
    assert.equal(classifyIssuanceForDashboard("pos"), "web")
    assert.equal(classifyIssuanceForDashboard("batch_print"), "paper")
    assert.equal(classifyIssuanceForDashboard("complimentary"), "other")
    assert.equal(classifyIssuanceForDashboard("accreditation"), "other")
  })

  it("does not let paper issued reduce digital remaining", () => {
    assert.equal(
      digitalRemaining({ capacity: 1000, digitalCapacity: 1000, sold: 200 }),
      800,
    )
    assert.equal(
      physicalRemaining({ physicalCapacity: 500, physicalIssued: 120 }),
      380,
    )
  })
})
