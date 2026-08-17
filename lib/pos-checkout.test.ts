import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isPosStaffRole,
  normalizePosPaymentMethod,
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
})
