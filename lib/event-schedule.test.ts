import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isFullPassDayId,
  isTicketValidForNow,
  normalizeDayId,
  parseScheduleDays,
  resolveEventAnchorDate,
} from "@/lib/event-schedule"

describe("event-schedule", () => {
  const days = [
    {
      id: "d1",
      title: "Día 1",
      start_time: "2026-11-14T20:00:00.000Z",
      end_time: "2026-11-15T04:00:00.000Z",
    },
    {
      id: "d2",
      title: "Día 2",
      start_time: "2026-11-15T20:00:00.000Z",
      end_time: "2026-11-16T04:00:00.000Z",
    },
  ]

  it("normalizes abono day ids", () => {
    assert.equal(isFullPassDayId(null), true)
    assert.equal(isFullPassDayId("all"), true)
    assert.equal(normalizeDayId("all"), null)
    assert.equal(normalizeDayId("d1"), "d1")
  })

  it("parses schedule days", () => {
    assert.equal(parseScheduleDays(days).length, 2)
    assert.equal(parseScheduleDays(null).length, 0)
  })

  it("parses camelCase form days and JSON strings", () => {
    const parsed = parseScheduleDays([
      {
        id: "d1",
        title: "Noche 1",
        startTime: "2026-11-14T20:00",
        endTime: "2026-11-15T04:00",
      },
      {
        id: "d2",
        title: "Noche 2",
        startTime: "2026-11-15T20:00",
        endTime: "2026-11-16T04:00",
      },
    ])
    assert.equal(parsed.length, 2)
    assert.equal(parsed[0]?.title, "Noche 1")
    assert.equal(
      parseScheduleDays(JSON.stringify(days)).length,
      2,
    )
  })

  it("does not drop ISO timestamps with Z", () => {
    const parsed = parseScheduleDays(days)
    assert.equal(parsed[0]?.start_time, days[0].start_time)
  })

  it("anchors event date to first jornada", () => {
    assert.equal(
      resolveEventAnchorDate(days, "2026-01-01T00:00:00.000Z"),
      days[0].start_time,
    )
  })

  it("blocks day-1 ticket on day-2 window", () => {
    const result = isTicketValidForNow({
      scheduleDays: days,
      dayId: "d1",
      now: new Date("2026-11-15T22:00:00.000Z"),
    })
    assert.equal(result.ok, false)
  })

  it("allows abono inside any jornada", () => {
    const result = isTicketValidForNow({
      scheduleDays: days,
      dayId: null,
      now: new Date("2026-11-15T22:00:00.000Z"),
    })
    assert.equal(result.ok, true)
  })
})
