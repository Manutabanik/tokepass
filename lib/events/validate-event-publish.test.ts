import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  evaluateEventCompleteness,
  MISSING_EVENT_DAY,
  MISSING_EVENT_FLYER,
  MISSING_EVENT_LOCATION,
  MISSING_EVENT_TITLE,
  MISSING_SELLABLE_TICKET,
} from "@/lib/events/validate-event-publish"

const days = [
  { id: "d1", title: "Viernes" },
  { id: "d2", title: "Sábado" },
]

const complete = {
  title: "Festival Test",
  flyerUrl: "https://cdn.example/flyer.jpg",
  location: "Hipódromo de Palermo",
  deliveryMode: "PRESENCIAL",
  date: "2026-09-01T20:00:00.000Z",
  scheduleDays: days,
  tickets: [
    {
      name: "General",
      dayId: "d1",
      visibility: "public",
      price: 0,
      capacity: 100,
    },
    {
      name: "General",
      dayId: "d2",
      visibility: "public",
      price: 15000,
      capacity: 80,
    },
  ],
}

describe("evaluateEventCompleteness", () => {
  it("approves a complete multi-day event including a free day", () => {
    const result = evaluateEventCompleteness(complete)
    assert.equal(result.canPublish, true)
    assert.deepEqual(result.missingFields, [])
  })

  it("rejects missing title, flyer and location", () => {
    const result = evaluateEventCompleteness({
      ...complete,
      title: "ab",
      flyerUrl: "",
      imageUrl: "",
      location: "",
      venueId: null,
    })
    assert.equal(result.canPublish, false)
    assert.ok(result.missingFields.includes(MISSING_EVENT_TITLE))
    assert.ok(result.missingFields.includes(MISSING_EVENT_FLYER))
    assert.ok(result.missingFields.includes(MISSING_EVENT_LOCATION))
  })

  it("rejects a registered day without an active sellable ticket", () => {
    const result = evaluateEventCompleteness({
      ...complete,
      tickets: [
        {
          name: "Viernes",
          dayId: "d1",
          visibility: "public",
          price: 5000,
          capacity: 20,
        },
        {
          name: "Sábado pausado",
          dayId: "d2",
          visibility: "private",
          price: 5000,
          capacity: 20,
        },
      ],
    })
    assert.equal(result.canPublish, false)
    assert.ok(result.missingFields.some((item) => /Sábado/.test(item)))
  })

  it("rejects events with no days and no anchor date", () => {
    const result = evaluateEventCompleteness({
      ...complete,
      date: null,
      scheduleDays: [],
      tickets: [
        { name: "General", visibility: "public", price: 1000, capacity: 10 },
      ],
    })
    assert.equal(result.canPublish, false)
    assert.ok(result.missingFields.includes(MISSING_EVENT_DAY))
  })

  it("rejects when there is no active ticket with stock", () => {
    const result = evaluateEventCompleteness({
      ...complete,
      scheduleDays: [{ id: "d1", title: "Único" }],
      tickets: [
        { name: "General", dayId: "d1", visibility: "public", price: 0, capacity: 0 },
      ],
    })
    assert.equal(result.canPublish, false)
    assert.ok(result.missingFields.includes(MISSING_SELLABLE_TICKET))
  })
})
