import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  draftCapacityThermometer,
  emptyEventDraftV2,
  eventDraftV2Schema,
  eventDraftV2UiSchema,
  parseEventDraftV2,
  toEventDraftV2Payload,
} from "@/lib/validations/event-draft-v2"

describe("eventDraftV2Schema", () => {
  it("accepts an empty name for JSON drafts", () => {
    const parsed = eventDraftV2Schema.parse({ basicInfo: { name: "" } })
    assert.equal(parsed.basicInfo.name, "")
    assert.equal(parsed.venueCapacity, 0)
    assert.deepEqual(parsed.tickets, [])
    assert.deepEqual(parsed.extras, [])
    assert.equal(parsed.settings.isPublic, false)
    assert.equal(parsed.settings.absorbFees, false)
  })

  it("surfaces required name only on the UI schema", () => {
    const persist = eventDraftV2Schema.safeParse({ basicInfo: { name: "" } })
    const ui = eventDraftV2UiSchema.safeParse({ basicInfo: { name: "" } })
    assert.equal(persist.success, true)
    assert.equal(ui.success, false)
  })
})

describe("parseEventDraftV2", () => {
  it("hydrates draft_state without inventing tickets or dropping extra keys", () => {
    const parsed = parseEventDraftV2({ title: "Fiesta", tickets: [], keep: 1 })
    assert.equal(parsed.basicInfo.name, "Fiesta")
    assert.equal(parsed.venueCapacity, 0)
    assert.deepEqual(parsed.tickets, [])
    assert.deepEqual(parsed.extras, [])
    assert.equal(parsed.settings.isPublic, false)
    assert.equal(parsed.settings.absorbFees, false)
    assert.equal(parsed.settings.refundPolicy, "")
    assert.equal(parsed.settings.checkoutMessage, "")
    assert.equal((parsed as { keep?: number }).keep, 1)
    assert.deepEqual(parseEventDraftV2(null), emptyEventDraftV2())
  })

  it("reads tickets, extras and settings from stored JSON", () => {
    const parsed = parseEventDraftV2({
      basicInfo: {
        name: "Club",
        startDate: "2026-09-01T22:00",
        locationName: "Niceto",
      },
      venueCapacity: "200",
      tickets: [
        {
          id: "t1",
          name: "General",
          description: "Acceso",
          price: "15000",
          stock: "80",
          minOrder: "2",
          maxOrder: "6",
        },
      ],
      extras: [{ id: "e1", name: "Cerveza", price: 4000, stock: 50 }],
      settings: {
        isPublic: true,
        absorbFees: true,
        refundPolicy: "Sin devoluciones",
        checkoutMessage: "Gracias",
      },
    })
    assert.equal(parsed.basicInfo.name, "Club")
    assert.equal(parsed.basicInfo.startDate, "2026-09-01T22:00")
    assert.equal(parsed.basicInfo.locationName, "Niceto")
    assert.equal(parsed.venueCapacity, 200)
    assert.deepEqual(parsed.tickets, [
      {
        id: "t1",
        name: "General",
        description: "Acceso",
        price: 15000,
        stock: 80,
        minOrder: 2,
        maxOrder: 6,
      },
    ])
    assert.equal(parsed.extras[0]?.name, "Cerveza")
    assert.equal(parsed.extras[0]?.minOrder, 1)
    assert.equal(parsed.extras[0]?.maxOrder, 10)
    assert.equal(parsed.settings.isPublic, true)
    assert.equal(parsed.settings.absorbFees, true)
    assert.equal(parsed.settings.refundPolicy, "Sin devoluciones")
    assert.equal(parsed.settings.checkoutMessage, "Gracias")
  })
})

describe("toEventDraftV2Payload", () => {
  it("mirrors basicInfo.name into title for older readers", () => {
    const payload = toEventDraftV2Payload({
      ...emptyEventDraftV2(),
      basicInfo: {
        ...emptyEventDraftV2().basicInfo,
        name: "After",
      },
    })
    assert.equal(payload.title, "After")
  })
})

describe("draftCapacityThermometer", () => {
  it("uses only ticket stock over venueCapacity", () => {
    const snap = draftCapacityThermometer({
      tickets: [{ stock: 40 }, { stock: 10 }],
      venueCapacity: 100,
    })
    assert.equal(snap.used, 50)
    assert.equal(snap.capacity, 100)
    assert.equal(snap.ratio, 0.5)
    assert.equal(snap.overCapacity, false)
  })

  it("never counts extras toward the thermometer", () => {
    const extras = [{ stock: 999 }]
    const snap = draftCapacityThermometer({
      tickets: [{ stock: 40 }],
      venueCapacity: 100,
    })
    assert.equal(snap.used, 40)
    assert.notEqual(snap.used, 40 + extras[0].stock)
  })
})
