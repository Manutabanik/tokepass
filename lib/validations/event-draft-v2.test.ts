import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  draftCapacityThermometer,
  emptyEventDraftV2,
  eventDraftV2Schema,
  parseEventDraftV2,
} from "@/lib/validations/event-draft-v2"

describe("eventDraftV2Schema", () => {
  it("accepts any title, including empty, for JSON drafts", () => {
    assert.equal(eventDraftV2Schema.parse({ title: "After" }).title, "After")
    assert.equal(eventDraftV2Schema.parse({ title: "" }).title, "")
  })

  it("fills inventory defaults without blocking an empty title", () => {
    const parsed = eventDraftV2Schema.parse({ title: "" })
    assert.equal(parsed.venueCapacity, 0)
    assert.deepEqual(parsed.tickets, [])
    assert.deepEqual(parsed.extras, [])
    assert.ok(parsed.settings)
  })
})

describe("parseEventDraftV2", () => {
  it("hydrates draft_state without inventing tickets or dropping extra keys", () => {
    assert.deepEqual(parseEventDraftV2({ title: "Fiesta", tickets: [], keep: 1 }), {
      title: "Fiesta",
      venueCapacity: 0,
      tickets: [],
      extras: [],
      settings: { isPublic: false, refundPolicy: "" },
      keep: 1,
    })
    assert.deepEqual(parseEventDraftV2(null), emptyEventDraftV2())
  })

  it("reads tickets, extras and settings from stored JSON", () => {
    const parsed = parseEventDraftV2({
      title: "Club",
      venueCapacity: "200",
      tickets: [{ id: "t1", name: "General", price: "15000", stock: "80" }],
      extras: [{ id: "e1", name: "Cerveza", price: 4000, stock: 50 }],
      settings: { isPublic: true, refundPolicy: "Sin devoluciones" },
    })
    assert.equal(parsed.venueCapacity, 200)
    assert.deepEqual(parsed.tickets, [
      { id: "t1", name: "General", price: 15000, stock: 80 },
    ])
    assert.deepEqual(parsed.extras, [
      { id: "e1", name: "Cerveza", price: 4000, stock: 50 },
    ])
    assert.equal(parsed.settings.isPublic, true)
    assert.equal(parsed.settings.refundPolicy, "Sin devoluciones")
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
