import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  MISSING_EVENT_DATE_ID,
  asHoldEventDateId,
  requireHoldEventDateId,
  seatingUnitMatchesEventDate,
} from "./seat-hold-day"

const dayA = "550e8400-e29b-41d4-a716-446655440001"
const dayB = "550e8400-e29b-41d4-a716-446655440002"

describe("asHoldEventDateId", () => {
  it("keeps real jornadas and drops full-pass tabs", () => {
    assert.equal(asHoldEventDateId(dayA), dayA)
    assert.equal(asHoldEventDateId("full_pass"), null)
    assert.equal(asHoldEventDateId("all"), null)
    assert.equal(asHoldEventDateId("día-1"), null)
  })
})

describe("requireHoldEventDateId", () => {
  it("allows a single-day event without event_date_id", () => {
    const result = requireHoldEventDateId({
      eventDateId: null,
      scheduleDayIds: [dayA],
    })
    assert.deepEqual(result, { ok: true, eventDateId: null })
  })

  it("rejects a multi-day hold without event_date_id", () => {
    const result = requireHoldEventDateId({
      eventDateId: null,
      scheduleDayIds: [dayA, dayB],
    })
    assert.deepEqual(result, { ok: false, error: MISSING_EVENT_DATE_ID })
  })

  it("accepts the selected jornada on a multi-day event", () => {
    const result = requireHoldEventDateId({
      eventDateId: dayB,
      scheduleDayIds: [dayA, dayB],
    })
    assert.deepEqual(result, { ok: true, eventDateId: dayB })
  })

  it("rejects a jornada that is not on the event schedule", () => {
    const result = requireHoldEventDateId({
      eventDateId: "550e8400-e29b-41d4-a716-446655440099",
      scheduleDayIds: [dayA, dayB],
    })
    assert.deepEqual(result, { ok: false, error: MISSING_EVENT_DATE_ID })
  })
})

describe("seatingUnitMatchesEventDate", () => {
  it("keeps units of the selected day and unbound single-day units", () => {
    assert.equal(
      seatingUnitMatchesEventDate({ event_date_id: dayA }, dayA),
      true,
    )
    assert.equal(
      seatingUnitMatchesEventDate({ event_date_id: dayB }, dayA),
      false,
    )
    assert.equal(
      seatingUnitMatchesEventDate({ event_date_id: null, day_id: null }, dayA),
      true,
    )
  })
})
