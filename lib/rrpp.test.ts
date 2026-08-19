import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildRrppSharePath,
  computePromoterCommission,
  extractAffiliateCode,
  pendingPromoterBalance,
  publicEventPathWithRrpp,
} from "@/lib/rrpp"

describe("rrpp affiliate links", () => {
  it("prioriza ?rrpp= sobre ?ref=", () => {
    const params = new URLSearchParams("rrpp=ANA-01&ref=OTRO")
    assert.equal(extractAffiliateCode(params), "ANA-01")
  })

  it("acepta ?ref= como alias de atribucion", () => {
    const params = new URLSearchParams("ref=codigo_test")
    assert.equal(extractAffiliateCode(params), "CODIGO_TEST")
  })

  it("arma el short link /e/slug?rrpp=", () => {
    assert.equal(
      buildRrppSharePath({
        slug: "evento-xyz",
        id: "11111111-1111-4111-8111-111111111111",
        referralCode: "codigo_test",
      }),
      "/e/evento-xyz?rrpp=CODIGO_TEST",
    )
  })

  it("agrega rrpp al path publico del evento", () => {
    assert.equal(
      publicEventPathWithRrpp({
        slug: "fiesta",
        id: "abc",
        referralCode: "RRPP1",
      }),
      "/eventos/fiesta?rrpp=RRPP1",
    )
  })

  it("calcula comision porcentual o fija por entrada", () => {
    assert.equal(
      computePromoterCommission({
        type: "percent",
        rate: 0.1,
        fixedAmount: 0,
        subtotal: 10000,
        ticketCount: 2,
      }),
      1000,
    )
    assert.equal(
      computePromoterCommission({
        type: "fixed",
        rate: 0.1,
        fixedAmount: 500,
        subtotal: 10000,
        ticketCount: 2,
      }),
      1000,
    )
  })

  it("resta liquidaciones del saldo pendiente sin ir a negativo", () => {
    assert.equal(pendingPromoterBalance(1500.2, 500.1), 1000.1)
    assert.equal(pendingPromoterBalance(200, 200), 0)
    assert.equal(pendingPromoterBalance(100, 250), 0)
  })
})
