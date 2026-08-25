import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createDraftScheduleDay,
  createDraftScheduleSlot,
  duplicateDraftSlotsToOtherDays,
  explicitDraftSlotCount,
  flattenDraftScheduleOccurrences,
  hasMultipleDraftSlots,
  joinDraftDateAndTime,
  listDraftScheduleSlots,
  normalizeDraftScheduleDay,
  slotEndDateTime,
} from "./draft-schedule-slots-v2"

describe("joinDraftDateAndTime", () => {
  it("builds a datetime-local value and rolls overnight slots", () => {
    assert.equal(joinDraftDateAndTime("2026-09-05", "10:00"), "2026-09-05T10:00")
    assert.equal(slotEndDateTime("2026-09-05", "22:00", "02:00"), "2026-09-06T02:00")
    assert.equal(slotEndDateTime("2026-09-05", "10:00", "12:00"), "2026-09-05T12:00")
  })
})

describe("normalizeDraftScheduleDay", () => {
  it("keeps legacy datetime-local days and derives the calendar date", () => {
    const day = normalizeDraftScheduleDay(
      {
        id: "day-1",
        name: "Día 1",
        startDate: "2026-09-01T18:00",
        endDate: "2026-09-01T23:00",
      },
      0,
    )
    assert.equal(day.date, "2026-09-01")
    assert.equal(day.startDate, "2026-09-01T18:00")
    assert.equal(day.endDate, "2026-09-01T23:00")
    assert.deepEqual(day.slots, [])
  })
})

describe("flattenDraftScheduleOccurrences", () => {
  it("expands one date with two slots into two occurrences", () => {
    const day = createDraftScheduleDay({
      id: "day-1",
      name: "Sábado de Cabalgata",
      date: "2026-09-05",
      slots: [
        createDraftScheduleSlot({
          id: "550e8400-e29b-41d4-a716-446655440011",
          startTime: "10:00",
          endTime: "12:00",
        }),
        createDraftScheduleSlot({
          id: "550e8400-e29b-41d4-a716-446655440012",
          startTime: "14:00",
          endTime: "16:00",
        }),
      ],
    })
    const occurrences = flattenDraftScheduleOccurrences([day])
    assert.equal(occurrences.length, 2)
    assert.equal(occurrences[0]?.startDateTime, "2026-09-05T10:00")
    assert.equal(occurrences[1]?.endDateTime, "2026-09-05T16:00")
    assert.equal(hasMultipleDraftSlots([day]), true)
    assert.equal(explicitDraftSlotCount([day]), 2)
    assert.equal(listDraftScheduleSlots([day]).length, 2)
  })
})

describe("duplicateDraftSlotsToOtherDays", () => {
  it("copies slot times to the other days with new ids", () => {
    const days = [
      createDraftScheduleDay({
        name: "Sábado",
        date: "2026-09-05",
        slots: [
          createDraftScheduleSlot({
            id: "slot-a",
            startTime: "10:00",
            endTime: "12:00",
            capacity: 12,
          }),
        ],
      }),
      createDraftScheduleDay({
        name: "Domingo",
        date: "2026-09-06",
        slots: [],
      }),
    ]
    const next = duplicateDraftSlotsToOtherDays(days, 0)
    assert.equal(next[1]?.slots[0]?.startTime, "10:00")
    assert.equal(next[1]?.slots[0]?.endTime, "12:00")
    assert.equal(next[1]?.slots[0]?.capacity, 12)
    assert.notEqual(next[1]?.slots[0]?.id, "slot-a")
    assert.equal(next[1]?.startDate, "2026-09-06T10:00")
  })
})
