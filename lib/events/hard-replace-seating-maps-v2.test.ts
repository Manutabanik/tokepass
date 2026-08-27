import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  pickUnusedPublishedSeatingMapRow,
  resolveHardReplaceSeatingMapDay,
} from "@/lib/events/published-seating-map-match"

const friday = "550e8400-e29b-41d4-a716-446655440001"
const saturday = "550e8400-e29b-41d4-a716-446655440002"
const unknown = "550e8400-e29b-41d4-a716-446655440099"

describe("resolveHardReplaceSeatingMapDay", () => {
  it("writes a jornada that already exists on the event", () => {
    const day = resolveHardReplaceSeatingMapDay({
      requested: friday,
      dayIds: new Set([friday, saturday]),
    })
    assert.deepEqual(day, { writeDateId: friday })
  })

  it("writes an undated map when the payload has no day", () => {
    const day = resolveHardReplaceSeatingMapDay({
      requested: null,
      dayIds: new Set([friday]),
    })
    assert.deepEqual(day, { writeDateId: null })
  })

  it("writes undated when the event has no schedules yet", () => {
    const day = resolveHardReplaceSeatingMapDay({
      requested: friday,
      dayIds: new Set(),
    })
    assert.deepEqual(day, { writeDateId: null })
  })

  it("does not collapse an unknown jornada onto the undated row", () => {
    const day = resolveHardReplaceSeatingMapDay({
      requested: unknown,
      dayIds: new Set([friday, saturday]),
    })
    assert.deepEqual(day, { keepRequested: unknown })
  })
})

describe("pickUnusedPublishedSeatingMapRow", () => {
  const undatedA = { id: "map-a", event_date_id: null }
  const undatedB = { id: "map-b", event_date_id: null }
  const fridayMap = { id: "map-fri", event_date_id: friday }

  it("skips a row already claimed so two undated maps do not collide", () => {
    const first = pickUnusedPublishedSeatingMapRow(
      [undatedA, undatedB],
      null,
      new Set(),
    )
    assert.equal(first?.id, "map-a")
    const second = pickUnusedPublishedSeatingMapRow(
      [undatedA, undatedB],
      null,
      new Set(["map-a"]),
    )
    assert.equal(second?.id, "map-b")
  })

  it("matches the unused row for a specific jornada", () => {
    const match = pickUnusedPublishedSeatingMapRow(
      [undatedA, fridayMap],
      friday,
      new Set(),
    )
    assert.equal(match?.id, "map-fri")
  })
})
