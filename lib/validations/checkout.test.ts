import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CheckoutPayloadSchema,
  CheckoutSeatHoldSchema,
} from "@/lib/validations/checkout"

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
  it("allows a free-order buyer without phone", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer: { ...buyer, phone: "" },
      items: [{ tierId: generalId, quantity: 1 }],
    })
    assert.equal(parsed.success, true)
  })

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

  it("accepts the discriminated general and mapped payload", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          type: "general",
          ticket_tier_id: generalId,
          quantity: 3,
        },
        {
          type: "mapped",
          ticket_tier_id: seatedTierId,
          seat_id: seatId,
          quantity: 1,
        },
      ],
    })
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    assert.equal(parsed.data.items?.[0]?.type, "general")
    assert.equal(parsed.data.items?.[0]?.ticketTierId, generalId)
    assert.equal(parsed.data.items?.[1]?.type, "mapped")
    assert.equal(parsed.data.items?.[1]?.seatingUnitId, seatId)
  })

  it("allows a map zone without seat_id", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          type: "general",
          ticket_tier_id: generalId,
          quantity: 3,
          sectorKey: "campo",
          has_map: true,
          is_numbered: false,
        },
      ],
    })
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    assert.equal(parsed.data.items?.[0]?.type, "general")
    assert.equal(parsed.data.items?.[0]?.seat_id, undefined)
    assert.equal(parsed.data.items?.[0]?.is_numbered, false)
  })

  it("allows a general zone sent as mapped without seat_id", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          type: "mapped",
          ticket_tier_id: generalId,
          quantity: 1,
          has_map: true,
          is_numbered: false,
        },
      ],
    })
    assert.equal(parsed.success, true)
  })

  it("rejects a mapped item without seat_id or element_id", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          type: "mapped",
          ticket_tier_id: seatedTierId,
          quantity: 1,
        },
      ],
    })
    assert.equal(parsed.success, false)
  })

  it("rejects a 9-digit DNI", () => {
    const longDni = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer: { ...buyer, dni: "123456789" },
      items: [{ tierId: generalId, quantity: 1 }],
    })
    assert.equal(longDni.success, false)
  })
})

describe("CheckoutSeatHoldSchema", () => {
  it("rejects a non-uuid seat before any database call", () => {
    const parsed = CheckoutSeatHoldSchema.safeParse({
      eventId,
      seatingUnitId: "asiento-1",
    })
    assert.equal(parsed.success, false)
  })

  it("accepts a numbered seat hold payload", () => {
    const parsed = CheckoutSeatHoldSchema.safeParse({
      eventId,
      seatingUnitId: seatId,
    })
    assert.equal(parsed.success, true)
  })
})
