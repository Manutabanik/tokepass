import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CheckoutPayloadSchema,
  CheckoutSeatHoldSchema,
  PublicTicketPriceSchema,
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

  it("accepts ticket_type_id and sector_id without client prices", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          ticket_type_id: generalId,
          sector_id: "platea-a",
          quantity: 2,
          price: 99,
          total: 198,
        },
      ],
    })
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    const item = parsed.data.items?.[0]
    assert.ok(item)
    assert.equal(item.ticketTierId, generalId)
    assert.equal(item.quantity, 2)
    assert.equal(item.sectorKey, "platea-a")
    assert.equal("price" in item, false)
    assert.equal("total" in item, false)
  })

  it("strips client prices and keeps only id plus quantity", () => {
    const parsed = CheckoutPayloadSchema.safeParse({
      eventId,
      buyer,
      items: [
        {
          tierId: generalId,
          quantity: 2,
          price: 1,
          unit_price: 1,
          total: 2,
        },
      ],
    })
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    const item = parsed.data.items?.[0]
    assert.ok(item)
    assert.equal(item.ticketTierId, generalId)
    assert.equal(item.quantity, 2)
    assert.equal("price" in item, false)
    assert.equal("unit_price" in item, false)
    assert.equal("total" in item, false)
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

describe("PublicTicketPriceSchema", () => {
  it("allows Gratis at 0 and rejects negatives", () => {
    assert.equal(PublicTicketPriceSchema.safeParse(0).success, true)
    assert.equal(PublicTicketPriceSchema.safeParse(15000).success, true)
    assert.equal(PublicTicketPriceSchema.safeParse(-1).success, false)
  })
})
