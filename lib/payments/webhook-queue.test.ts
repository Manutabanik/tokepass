import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  extractMercadoPagoPaymentId,
  parseMercadoPagoNotification,
} from "./mercadopago/parse-notification"

describe("extractMercadoPagoPaymentId", () => {
  it("reads data.id from the query string", () => {
    assert.equal(
      extractMercadoPagoPaymentId(
        "https://tokepass.test/api/webhooks/mercadopago?data.id=12345&type=payment",
        "",
      ),
      "12345",
    )
  })

  it("reads data.id from the JSON body", () => {
    assert.equal(
      extractMercadoPagoPaymentId(
        "https://tokepass.test/api/webhooks/mercadopago",
        JSON.stringify({ type: "payment", data: { id: 99 } }),
      ),
      "99",
    )
  })

  it("does not treat a chargeback id as a payment id", () => {
    assert.equal(
      extractMercadoPagoPaymentId(
        "https://tokepass.test/api/webhooks/mercadopago?topic=chargebacks&id=888",
        "",
      ),
      null,
    )
  })
})

describe("parseMercadoPagoNotification", () => {
  it("parses topic_chargebacks_wh as a chargeback", () => {
    assert.deepEqual(
      parseMercadoPagoNotification(
        "https://tokepass.test/api/webhooks/mercadopago",
        JSON.stringify({ type: "topic_chargebacks_wh", data: { id: 777 } }),
      ),
      { kind: "chargeback", id: "777" },
    )
  })

  it("parses IPN topic=chargebacks", () => {
    assert.deepEqual(
      parseMercadoPagoNotification(
        "https://tokepass.test/api/webhooks/mercadopago?topic=chargebacks&id=555",
        "",
      ),
      { kind: "chargeback", id: "555" },
    )
  })
})
