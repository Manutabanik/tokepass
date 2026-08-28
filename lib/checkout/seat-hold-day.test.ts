import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  MISSING_EVENT_DATE_ID,
  MISSING_EVENT_DATE_ID_MESSAGE,
  asHoldEventDateId,
  requireHoldEventDateId,
  seatingUnitMatchesEventDate,
  filterSeatingUnitsForRequestedDay,
  pickSeatingUnitRowForRequestedDay,
  storefrontItemMatchesSchedule,
  storefrontSelectionKey,
} from "./seat-hold-day"

const dayA = "550e8400-e29b-41d4-a716-446655440001"
const dayB = "550e8400-e29b-41d4-a716-446655440002"

describe("MISSING_EVENT_DATE_ID_MESSAGE", () => {
  it("speaks to the buyer, not the debugger", () => {
    assert.match(MISSING_EVENT_DATE_ID_MESSAGE, /día del evento/)
    assert.doesNotMatch(MISSING_EVENT_DATE_ID_MESSAGE, /seat-hold|event_date_id/)
  })
})

describe("asHoldEventDateId", () => {
  it("keeps real jornadas and drops full-pass tabs", () => {
    assert.equal(asHoldEventDateId(dayA), dayA)
    assert.equal(asHoldEventDateId("full_pass"), null)
    assert.equal(asHoldEventDateId("combo_packs"), null)
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

describe("storefrontSelectionKey", () => {
  it("keeps the same layout item unique per jornada", () => {
    assert.equal(
      storefrontSelectionKey({ id: "seat-1", eventDateId: dayA }),
      `seat-1::${dayA}`,
    )
    assert.equal(
      storefrontSelectionKey({ id: "seat-1", eventDateId: dayB }),
      `seat-1::${dayB}`,
    )
    assert.equal(storefrontSelectionKey({ id: "seat-1" }), "seat-1")
    assert.equal(
      storefrontSelectionKey({ id: "seat-1", scheduleId: dayA }),
      `seat-1::${dayA}`,
    )
  })
})

describe("storefrontItemMatchesSchedule", () => {
  it("isolates dated items to their jornada", () => {
    assert.equal(
      storefrontItemMatchesSchedule({ eventDateId: dayA }, dayA),
      true,
    )
    assert.equal(
      storefrontItemMatchesSchedule({ eventDateId: dayA }, dayB),
      false,
    )
    assert.equal(storefrontItemMatchesSchedule({ id: "seat-1" }, dayA), true)
    assert.equal(
      storefrontItemMatchesSchedule({ id: "seat-1" }, dayA, {
        scheduleDayCount: 2,
      }),
      false,
    )
    assert.equal(
      storefrontItemMatchesSchedule({ scheduleId: dayA }, dayB, {
        scheduleDayCount: 2,
      }),
      false,
    )
    assert.equal(
      storefrontItemMatchesSchedule({ scheduleId: dayA }, dayA, {
        scheduleDayCount: 2,
      }),
      true,
    )
  })

  it("keeps combo packs visible on every jornada tab", () => {
    assert.equal(
      storefrontItemMatchesSchedule(
        { id: "mesa-09", comboTierId: "pack-1", eventDateId: dayA },
        dayB,
        { scheduleDayCount: 2 },
      ),
      true,
    )
    assert.equal(
      storefrontItemMatchesSchedule(
        { id: "mesa-09", comboTierId: "pack-1" },
        dayA,
        { scheduleDayCount: 2 },
      ),
      true,
    )
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
    assert.equal(
      seatingUnitMatchesEventDate(
        { event_date_id: null, day_id: null },
        dayA,
        { scheduleDayCount: 2 },
      ),
      false,
    )
    assert.equal(
      seatingUnitMatchesEventDate({ event_date_id: dayA }, null, {
        scheduleDayCount: 2,
      }),
      false,
    )
  })
})

describe("filterSeatingUnitsForRequestedDay", () => {
  it("keeps undated units on a single-day event", () => {
    const units = filterSeatingUnitsForRequestedDay(
      [
        { id: "a", eventDateId: null },
        { id: "b", eventDateId: dayA },
      ],
      dayA,
      1,
    )
    assert.deepEqual(
      units.map((unit) => unit.id),
      ["a", "b"],
    )
  })

  it("keeps only the selected jornada on a multi-day event", () => {
    const units = filterSeatingUnitsForRequestedDay(
      [
        { id: "undated", eventDateId: null },
        { id: "fri", eventDateId: dayA },
        { id: "sat", eventDateId: dayB },
      ],
      dayB,
      2,
    )
    assert.deepEqual(
      units.map((unit) => unit.id),
      ["sat"],
    )
  })

  it("returns nothing when a multi-day event has no selected jornada", () => {
    assert.deepEqual(
      filterSeatingUnitsForRequestedDay(
        [{ id: "fri", eventDateId: dayA }],
        null,
        2,
      ),
      [],
    )
  })
})

describe("pickSeatingUnitRowForRequestedDay", () => {
  it("prefers the dated unit and still accepts undated on one jornada", () => {
    const picked = pickSeatingUnitRowForRequestedDay(
      [
        { id: "undated", event_date_id: null },
        { id: "dated", event_date_id: dayA },
      ],
      dayA,
      1,
    )
    assert.equal(picked?.id, "dated")
  })

  it("never returns Saturday when Friday is requested", () => {
    const picked = pickSeatingUnitRowForRequestedDay(
      [
        { id: "undated", event_date_id: null },
        { id: "sat", event_date_id: dayB },
      ],
      dayA,
      2,
    )
    assert.equal(picked, null)
  })
})
