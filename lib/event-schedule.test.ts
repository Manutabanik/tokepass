import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  defaultInventoryDayId,
  findScheduleDay,
  formatInventoryDayOption,
  isFullPassDayId,
  isTicketValidForNow,
  listEventFormJornadas,
  newScheduleDayId,
  normalizeDayId,
  parseScheduleDays,
  remapBoundDayId,
  remapDayIdsByOrder,
  resolveEventAnchorDate,
  resolveEventSchedulePersist,
  resolveTicketDate,
  scheduleDaysFromEvent,
} from "@/lib/event-schedule"
import { formatEventCartDateLong } from "@/lib/format"

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

  it("labels inventory day options and defaults new SKUs to the first jornada", () => {
    assert.equal(defaultInventoryDayId(days), "d1")
    assert.equal(defaultInventoryDayId(days.slice(0, 1)), null)
    assert.match(formatInventoryDayOption(days[0]!, 0), /Día 1/)
  })

  it("formats jornada options from the live start date, not a stale title", () => {
    const label = formatInventoryDayOption(
      {
        id: "d1",
        title: "Día 1 - 13 de Noviembre",
        startTime: "2026-08-21T20:00",
      },
      0,
    )
    assert.match(label, /^Día 1 - /)
    assert.match(label, /21/)
    assert.doesNotMatch(label, /13 de Noviembre/)
  })

  it("fills empty jornada start times from the identity date", () => {
    const next = listEventFormJornadas({
      date: "2026-08-21T20:00",
      scheduleDays: [
        { id: "d1", title: "Día 1", startTime: "", endTime: "" },
        {
          id: "d2",
          title: "Día 2",
          startTime: "2026-08-22T21:00",
          endTime: "",
        },
      ],
    })
    assert.equal(next[0]?.startTime, "2026-08-21T20:00")
    assert.equal(next[1]?.startTime, "2026-08-22T21:00")
  })

  it("normalizes abono day ids", () => {
    assert.equal(isFullPassDayId(null), true)
    assert.equal(isFullPassDayId("all"), true)
    assert.equal(normalizeDayId("all"), null)
    assert.equal(normalizeDayId("d1"), "d1")
  })

  it("generates uuid jornada ids", () => {
    const id = newScheduleDayId()
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it("parses schedule days", () => {
    assert.equal(parseScheduleDays(days).length, 2)
    assert.equal(parseScheduleDays(null).length, 0)
  })

  it("prefers relational jornadas over JSONB mirror", () => {
    const relational = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Relacional",
        start_time: "2026-11-14T20:00:00.000Z",
        end_time: "2026-11-15T04:00:00.000Z",
      },
    ]
    const parsed = scheduleDaysFromEvent({
      relational,
      json: days,
    })
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0]?.title, "Relacional")
    assert.equal(
      scheduleDaysFromEvent({ relational: [], json: days }).length,
      2,
    )
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

  it("dates a day-bound ticket on its own jornada, not on day 1", () => {
    // Viernes 13 Nov 2026 (día 1) + Sábado 14 Nov 2026 (día 2), 21:00 -03.
    const weekend = [
      {
        id: "d1",
        title: "Día 1",
        start_time: "2026-11-14T00:00:00.000Z",
        end_time: "2026-11-14T08:00:00.000Z",
      },
      {
        id: "d2",
        title: "Día 2",
        start_time: "2026-11-15T00:00:00.000Z",
        end_time: "2026-11-15T08:00:00.000Z",
      },
    ]
    const eventDate = weekend[0].start_time

    const saturdayTicket = {
      eventDate,
      doorsOpenAt: findScheduleDay(weekend, "d2")!.start_time,
    }
    assert.equal(
      formatEventCartDateLong(resolveTicketDate(saturdayTicket)),
      "Sábado 14 Nov",
    )

    const fridayTicket = {
      eventDate,
      doorsOpenAt: findScheduleDay(weekend, "d1")!.start_time,
    }
    assert.equal(
      formatEventCartDateLong(resolveTicketDate(fridayTicket)),
      "Viernes 13 Nov",
    )
  })

  it("falls back to the event date when a ticket has no jornada anchor", () => {
    assert.equal(
      resolveTicketDate({ eventDate: days[0].start_time, doorsOpenAt: null }),
      days[0].start_time,
    )
    assert.equal(
      resolveTicketDate({ eventDate: days[0].start_time, doorsOpenAt: "  " }),
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

  it("remaps stale day ids after the event dates change", () => {
    assert.equal(remapBoundDayId("d1", ["d1", "d2"]), "d1")
    assert.equal(remapBoundDayId("old", ["d1", "d2"]), null)
    assert.equal(remapBoundDayId("all", ["d1", "d2"]), null)
    assert.equal(remapBoundDayId("old", ["d1", "d2"], "first"), "d1")
    assert.equal(remapBoundDayId(null, [], "first"), null)

    const remap = remapDayIdsByOrder(["old-a", "old-b"], ["new-a", "new-b"])
    assert.equal(remap.get("old-a"), "new-a")
    assert.equal(remap.get("old-b"), "new-b")
  })

  it("formats form dates to ISO 8601 timestamptz", () => {
    const written = resolveEventSchedulePersist({
      date: "2026-09-15T20:00",
      endDate: "2026-09-16T02:00",
    })
    assert.ok(!("error" in written))
    if ("error" in written) return
    assert.equal(written.skipWrite, false)
    assert.match(written.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.match(
      written.ends_at ?? "",
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
    assert.equal(new Date(written.date).getTime(), new Date(2026, 8, 15, 20, 0).getTime())
  })

  it("rejects unparseable dates instead of falling back silently", () => {
    const start = resolveEventSchedulePersist({ date: "no-es-una-fecha" })
    assert.ok("error" in start)
    if ("error" in start) {
      assert.match(start.error, /Error guardando fechas/)
    }
    const end = resolveEventSchedulePersist({
      date: "2026-09-15T20:00",
      endDate: "fecha-rota",
    })
    assert.ok("error" in end)
  })

  it("keeps the existing date when the form did not send a new one", () => {
    const written = resolveEventSchedulePersist({
      existing: {
        date: "2026-08-01T23:00:00.000Z",
        ends_at: "2026-08-02T04:00:00.000Z",
      },
    })
    assert.ok(!("error" in written))
    if ("error" in written) return
    assert.equal(written.skipWrite, true)
    assert.equal(written.date, "2026-08-01T23:00:00.000Z")
    assert.equal(written.ends_at, "2026-08-02T04:00:00.000Z")
  })
})
