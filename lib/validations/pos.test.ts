import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { POS_RPC_QTY_CAP } from "@/lib/pos-cart"
import {
  PosSaleInputSchema,
  formatPosValidationError,
} from "@/lib/validations/pos"

const validSale = {
  eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tierId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  shiftId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  quantity: 2,
  paymentMethod: "cash" as const,
}

describe("PosSaleInputSchema", () => {
  it("accepts a cash sale and normalizes blank identity fields", () => {
    const parsed = PosSaleInputSchema.safeParse({
      ...validSale,
      customerName: "  ",
      customerEmail: "",
      customerDni: null,
    })
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    assert.equal(parsed.data.customerName, null)
    assert.equal(parsed.data.customerEmail, null)
  })

  it("rejects quantity above the POS RPC cap", () => {
    const parsed = PosSaleInputSchema.safeParse({
      ...validSale,
      quantity: POS_RPC_QTY_CAP + 1,
    })
    assert.equal(parsed.success, false)
    if (parsed.success) return
    assert.match(formatPosValidationError(parsed.error), /Máximo 20/)
  })

  it("rejects a non-uuid event id with a clean message", () => {
    const parsed = PosSaleInputSchema.safeParse({
      ...validSale,
      eventId: "not-a-uuid",
    })
    assert.equal(parsed.success, false)
    if (parsed.success) return
    assert.equal(formatPosValidationError(parsed.error), "Identificador inválido.")
  })

  it("rejects an invalid email instead of sending it to the database", () => {
    const parsed = PosSaleInputSchema.safeParse({
      ...validSale,
      customerEmail: "caja@",
    })
    assert.equal(parsed.success, false)
  })
})
