import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EMAIL_WALLET_CTA,
  LIVING_QR_EMAIL_DISCLAIMER,
  WALLET_PATH,
  walletReceiptUrl,
} from "./receipt-copy"

describe("email receipt copy", () => {
  it("points the CTA to the buyer wallet", () => {
    assert.equal(WALLET_PATH, "/cuenta/entradas")
    assert.equal(
      walletReceiptUrl("https://tokepass.com.ar/"),
      "https://tokepass.com.ar/cuenta/entradas",
    )
    assert.match(EMAIL_WALLET_CTA, /entradas/i)
    assert.match(LIVING_QR_EMAIL_DISCLAIMER, /dinámicas/)
    assert.doesNotMatch(LIVING_QR_EMAIL_DISCLAIMER, /qrserver|base64|pdf/i)
  })
})
