import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  expandDraftTicketsForSchedule,
  occurrenceIdsForDraftTicket,
  pruneDraftScheduleBindings,
} from "@/lib/events/draft-schedule-bindings"
import { flattenDraftScheduleOccurrences } from "@/lib/events/draft-schedule-slots-v2"
import { draftLineItem } from "@/tests/fixtures/event-draft-v2"

const dayId = "550e8400-e29b-41d4-a716-446655440010"
const slotA = "550e8400-e29b-41d4-a716-446655440011"
const slotB = "550e8400-e29b-41d4-a716-446655440012"

const twoSlotDay = [
  {
    id: dayId,
    name: "Sábado",
    date: "2026-09-05",
    startDate: "2026-09-05T10:00",
    endDate: "2026-09-05T18:00",
    slots: [
      { id: slotA, startTime: "10:00", endTime: "12:00" },
      { id: slotB, startTime: "14:00", endTime: "18:00" },
    ],
  },
]

describe("occurrenceIdsForDraftTicket", () => {
  const occurrences = flattenDraftScheduleOccurrences(twoSlotDay)

  it("expands a day chip onto every slot of that day", () => {
    assert.deepEqual(
      occurrenceIdsForDraftTicket({ validDayIds: [dayId] }, occurrences),
      [slotA, slotB],
    )
  })

  it("keeps an explicit slot binding", () => {
    assert.deepEqual(
      occurrenceIdsForDraftTicket({ slotId: slotB }, occurrences),
      [slotB],
    )
  })
})

describe("expandDraftTicketsForSchedule", () => {
  it("clones one day-bound ticket per slot", () => {
    const occurrences = flattenDraftScheduleOccurrences(twoSlotDay)
    const expanded = expandDraftTicketsForSchedule(
      [
        draftLineItem({
          id: "pase-sabado",
          source: "general",
          validDayIds: [dayId],
        }),
      ],
      occurrences,
    )
    assert.equal(expanded.length, 2)
    assert.equal(expanded[0]?.id, "pase-sabado")
    assert.equal(expanded[0]?.slotId, slotA)
    assert.equal(expanded[1]?.id, `pase-sabado:${slotB}`)
    assert.equal(expanded[1]?.slotId, slotB)
  })
})

describe("pruneDraftScheduleBindings", () => {
  it("drops maps and map tickets of a deleted day", () => {
    const next = pruneDraftScheduleBindings({
      schedule: twoSlotDay,
      seatingMaps: [
        { dateId: dayId, mapConfig: { version: 1 } },
        { dateId: "dead-day", mapConfig: { version: 1 } },
      ],
      tickets: [
        {
          id: "map-live",
          source: "map",
          slotId: dayId,
          validDayIds: [dayId],
        },
        {
          id: "map-dead",
          source: "map",
          slotId: "dead-day",
          validDayIds: ["dead-day"],
        },
        {
          id: "ga",
          source: "general",
          validDayIds: [dayId, "dead-day"],
        },
      ],
      extras: [],
    })
    assert.deepEqual(
      next.seatingMaps?.map((item) => item.dateId),
      [dayId],
    )
    assert.deepEqual(
      next.tickets?.map((ticket) => ticket.id),
      ["map-live", "ga"],
    )
    assert.deepEqual(next.tickets?.[1]?.validDayIds, [dayId])
  })

  it("drops lineup day chips that no longer exist", () => {
    const next = pruneDraftScheduleBindings({
      schedule: twoSlotDay,
      lineup: [
        { dayIds: [dayId, "dead-day"] },
        { dayIds: ["dead-day"] },
      ],
      tickets: [],
      extras: [],
    })
    assert.deepEqual(next.lineup?.[0]?.dayIds, [dayId])
    assert.deepEqual(next.lineup?.[1]?.dayIds, [])
  })
})
