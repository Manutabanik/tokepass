import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CheckoutPayloadSchema } from "@/lib/validations/checkout"

const buyer = {
  firstName: "Ana",
  lastName: "Perez",
  email: "ana@example.com",
  dni: "30111222",
  phone: "1123456789",
}

const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const generalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const addonId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const seatId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const seatedTierId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"

describe("CheckoutPayloadSchema mixed inventory", () => {
  it("allows one numbered seat plus general and addon lines", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          tierId: seatedTierId,
          quantity: 1,
          seatingUnitId: seatId,
        },
        { tierId: generalId, quantity: 2 },
        { tierId: addonId, quantity: 1 },
      ],
    })
    assert.equal(parsed.success, true)
  })

  it("allows two numbered seating units plus general and addon lines", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          tierId: seatedTierId,
          quantity: 1,
          seatingUnitId: seatId,
        },
        {
          tierId: seatedTierId,
          quantity: 1,
          seatingUnitId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        },
        { tierId: generalId, quantity: 3 },
        { tierId: addonId, quantity: 1 },
      ],
    })
    assert.equal(parsed.success, true)
  })

  it("rejects duplicate seating unit ids", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          tierId: seatedTierId,
          quantity: 1,
          seatingUnitId: seatId,
        },
        {
          tierId: seatedTierId,
          quantity: 1,
          seatingUnitId: seatId,
        },
      ],
    })
    assert.equal(parsed.success, false)
  })

  it("rejects a seated line with quantity other than 1", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          tierId: seatedTierId,
          quantity: 2,
          seatingUnitId: seatId,
        },
      ],
    })
    assert.equal(parsed.success, false)
  })

  it("rejects a 9-digit DNI and a missing phone", () => {
    const withoutPhone = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer: { ...buyer, phone: "" },
      items: [{ tierId: generalId, quantity: 1 }],
    })
    assert.equal(withoutPhone.success, false)

    const longDni = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer: { ...buyer, dni: "123456789" },
      items: [{ tierId: generalId, quantity: 1 }],
    })
    assert.equal(longDni.success, false)
  })
})
