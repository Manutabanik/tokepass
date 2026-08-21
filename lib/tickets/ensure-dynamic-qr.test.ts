import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildDynamicQrPatch, needsDynamicQrSecret } from "./ensure-dynamic-qr"

describe("dynamic QR after payment", () => {
  it("skips online tickets", () => {
    assert.equal(
      needsDynamicQrSecret({
        id: "t1",
        status: "valid",
        events: { delivery_mode: "ONLINE" },
      }),
      false,
    )
  })

  it("builds secrets for presencial tickets missing QR", () => {
    const patch = buildDynamicQrPatch({
      id: "t1",
      status: "valid",
      qr_code: null,
      totp_secret: null,
      events: { delivery_mode: "PRESENCIAL", qr_type: "dynamic" },
    })
    assert.ok(patch)
    assert.ok(patch.qr_code.length > 0)
    assert.ok(patch.totp_secret.length > 0)
    assert.equal(patch.is_dynamic_qr, true)
  })

  it("does not rotate an existing QR", () => {
    assert.equal(
      buildDynamicQrPatch({
        id: "t1",
        status: "valid",
        qr_code: "already",
        totp_secret: "secret",
      }),
      null,
    )
  })
})
