import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  normalizeReferralCode,
  readAffiliateQueryCode,
} from "@/lib/referral"

describe("referral affiliate capture", () => {
  it("normaliza rrpp_code en mayusculas", () => {
    assert.equal(normalizeReferralCode("codigo_test"), "CODIGO_TEST")
    assert.equal(normalizeReferralCode("bad code"), null)
  })

  it("prioriza ?rrpp= sobre ?ref= al persistir atribucion", () => {
    const params = new URLSearchParams("rrpp=ana-01&ref=otro")
    assert.equal(readAffiliateQueryCode(params), "ANA-01")
  })
})
