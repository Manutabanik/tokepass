import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isPosStaffRole,
  normalizePosPaymentMethod,
  posLiveAvailable,
  POS_STAFF_ROLES,
} from "@/lib/pos-checkout"

describe("pos checkout staff and payment aliases", () => {
  it("autoriza cajero y alias de boleteria, no puerta", () => {
    assert.equal(isPosStaffRole("cashier"), true)
    assert.equal(isPosStaffRole("door_staff"), false)
    assert.equal(isPosStaffRole("box_office_cashier"), true)
    assert.equal(isPosStaffRole("bar_staff"), false)
    assert.deepEqual(POS_STAFF_ROLES, ["cashier"])
  })

  it("canoniza cash / card / transfer al metodo presencial", () => {
    assert.equal(normalizePosPaymentMethod("cash"), "cash_pos")
    assert.equal(normalizePosPaymentMethod("card_pos"), "card_pos")
    assert.equal(normalizePosPaymentMethod("transfer"), "transfer_pos")
    assert.equal(normalizePosPaymentMethod("mercadopago"), null)
  })

  it("no descuenta aforo real en eventos sandbox", () => {
    assert.equal(posLiveAvailable(100, 40, "draft"), 100)
    assert.equal(posLiveAvailable(100, 40, "published"), 60)
    assert.equal(posLiveAvailable(10, 12, "published"), 0)
    assert.equal(posLiveAvailable(100, 10, "cancellation_requested"), 0)
    assert.equal(posLiveAvailable(100, 10, "cancelled"), 0)
  })
})
