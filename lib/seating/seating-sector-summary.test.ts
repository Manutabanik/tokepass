import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isSeatingSummaryMinUuidError,
  pickSectorSummaryForDay,
  seatingSummariesFromTicketTiers,
} from "./seating-sector-summary"

describe("seating-sector-summary", () => {
  it("detecta el error min(uuid) de Postgres", () => {
    assert.equal(
      isSeatingSummaryMinUuidError({
        message:
          '{"code":"42883","message":"function min(uuid) does not exist"}',
      }),
      true,
    )
    assert.equal(isSeatingSummaryMinUuidError({ message: "timeout" }), false)
  })

  it("arma resumen desde tickets sentados y omite general", () => {
    const rows = seatingSummariesFromTicketTiers([
      {
        id: "t-vip",
        name: "VIP",
        capacity: 20,
        sold: 5,
        layout_type: "table_combo",
        seating_sector_id: "zona-vip",
        capacity_per_unit: 4,
      },
      {
        id: "t-ga",
        name: "General",
        capacity: 100,
        sold: 10,
        layout_type: "general",
      },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.sectorId, "zona-vip")
    assert.equal(rows[0]?.available, 15)
    assert.equal(rows[0]?.sold, 5)
    assert.equal(rows[0]?.total, 20)
  })

  it("picks the sector summary of the selected jornada", () => {
    const friday = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const saturday = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const rows = [
      {
        sectorId: "vip",
        sectorName: "VIP",
        available: 0,
        eventDateId: friday,
      },
      {
        sectorId: "vip",
        sectorName: "VIP",
        available: 8,
        eventDateId: saturday,
      },
    ]
    assert.equal(
      pickSectorSummaryForDay(rows, {
        sectorId: "vip",
        eventDateId: saturday,
      })?.available,
      8,
    )
  })

  it("does not pick an arbitrary jornada when the day is missing", () => {
    const friday = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const saturday = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    assert.equal(
      pickSectorSummaryForDay(
        [
          { sectorId: "vip", available: 0, eventDateId: friday },
          { sectorId: "vip", available: 8, eventDateId: saturday },
        ],
        { sectorId: "vip" },
      ),
      undefined,
    )
  })

  it("keeps an undated single-day summary when the schedule UUID is selected", () => {
    const day = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    assert.equal(
      pickSectorSummaryForDay(
        [{ sectorId: "vip", available: 12, eventDateId: null }],
        { sectorId: "vip", eventDateId: day, scheduleDayCount: 1 },
      )?.available,
      12,
    )
  })
})
