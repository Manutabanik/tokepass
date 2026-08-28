import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  effectiveSeatingUnitStatus,
  hexToRgba,
  occupancyFromSeatingUnits,
  resolveLiveVenueSeatStatus,
  seatingUnitsForComboDays,
  seatingUnitsForOccupancyDay,
} from "./venue-map-occupancy"

describe("venue-map-occupancy", () => {
  it("blocks map-blocked seats even if occupancy is available", () => {
    assert.equal(
      resolveLiveVenueSeatStatus({
        mapStatus: "blocked",
        occupancy: "available",
        selected: true,
      }),
      "blocked",
    )
  })

  it("keeps the buyer selection painted when occupancy is their own hold", () => {
    assert.equal(
      resolveLiveVenueSeatStatus({
        mapStatus: "available",
        occupancy: "occupied",
        selected: true,
      }),
      "selected",
    )
  })

  it("keeps a server-held seat selected while occupancy is reserved", () => {
    assert.equal(
      resolveLiveVenueSeatStatus({
        mapStatus: "available",
        occupancy: "occupied",
        selected: true,
        held: true,
      }),
      "selected",
    )
  })

  it("paints another buyer's cart hold as held, not sold", () => {
    assert.equal(
      resolveLiveVenueSeatStatus({
        mapStatus: "available",
        occupancy: "held",
        selected: false,
      }),
      "held",
    )
  })

  it("maps a sold unit to occupied and a live hold to held", () => {
    const occupancy = occupancyFromSeatingUnits(
      [
        {
          layoutItemId: "sold-1",
          status: "sold",
          soldOrderId: "order-1",
        },
        {
          layoutItemId: "hold-1",
          status: "available",
          holdExpiresAt: "2099-01-01T00:00:00.000Z",
        },
      ],
      ["sold-1", "hold-1"],
    )
    assert.equal(occupancy["sold-1"], "occupied")
    assert.equal(occupancy["hold-1"], "held")
  })

  it("maps an active reserved unit to held", () => {
    const occupancy = occupancyFromSeatingUnits(
      [
        {
          layoutItemId: "a-1",
          status: "reserved",
          reservedUntil: "2099-01-01T00:00:00.000Z",
        },
      ],
      ["a-1"],
    )
    assert.equal(occupancy["a-1"], "held")
  })

  it("converts hex to rgba", () => {
    assert.equal(hexToRgba("#10b981", 0.2), "rgba(16, 185, 129, 0.2)")
  })

  it("marks unpublished layout items occupied after a live fetch", () => {
    const occupancy = occupancyFromSeatingUnits(
      [{ layoutItemId: "a-1", status: "available" }],
      ["a-1", "a-2"],
    )
    assert.equal(occupancy["a-1"], "available")
    assert.equal(occupancy["a-2"], "occupied")
  })

  it("treats expired reserved units as available", () => {
    assert.equal(
      effectiveSeatingUnitStatus(
        "reserved",
        "2020-01-01T00:00:00.000Z",
        Date.parse("2026-08-16T00:00:00.000Z"),
      ),
      "available",
    )
    const occupancy = occupancyFromSeatingUnits(
      [
        {
          layoutItemId: "a-1",
          status: "reserved",
          reservedUntil: "2020-01-01T00:00:00.000Z",
        },
      ],
      ["a-1"],
    )
    assert.equal(occupancy["a-1"], "available")
  })

  it("keeps occupancy of mesa-09 isolated to the selected jornada", () => {
    const friday = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const saturday = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const units = seatingUnitsForOccupancyDay(
      [
        {
          layoutItemId: "mesa-09",
          tierId: friday,
          eventDateId: friday,
          status: "sold",
        },
        {
          layoutItemId: "mesa-09",
          tierId: saturday,
          eventDateId: saturday,
          status: "available",
        },
      ],
      {
        eventDateId: saturday,
        dayTierIds: new Set([saturday]),
      },
    )
    const occupancy = occupancyFromSeatingUnits(units)
    assert.equal(units.length, 1)
    assert.equal(occupancy["mesa-09"], "available")
  })

  it("does not let an undated mesa leak into a dated jornada", () => {
    const saturday = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const units = seatingUnitsForOccupancyDay(
      [
        {
          layoutItemId: "mesa-09",
          eventDateId: null,
          status: "sold",
        },
        {
          layoutItemId: "mesa-09",
          eventDateId: saturday,
          status: "available",
        },
      ],
      { eventDateId: saturday },
    )
    assert.equal(units.length, 1)
    assert.equal(units[0]?.status, "available")
  })

  it("keeps undated occupancy on a single-day event with a schedule UUID", () => {
    const day = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const units = seatingUnitsForOccupancyDay(
      [
        {
          layoutItemId: "mesa-09",
          eventDateId: null,
          status: "available",
        },
      ],
      { eventDateId: day, scheduleDayCount: 1 },
    )
    assert.equal(units.length, 1)
    assert.equal(units[0]?.status, "available")
  })

  it("drops undated units on multi-day even when no dated sibling exists", () => {
    const saturday = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const units = seatingUnitsForOccupancyDay(
      [
        {
          layoutItemId: "mesa-09",
          eventDateId: null,
          status: "sold",
        },
      ],
      { eventDateId: saturday, scheduleDayCount: 2 },
    )
    assert.equal(units.length, 0)
  })
})

describe("seatingUnitsForComboDays", () => {
  it("marks a seat occupied if any jornada of the pack is sold", () => {
    const friday = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const saturday = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const units = seatingUnitsForComboDays(
      [
        {
          layoutItemId: "mesa-09",
          eventDateId: friday,
          status: "available",
        },
        {
          layoutItemId: "mesa-09",
          eventDateId: saturday,
          status: "sold",
        },
      ],
      [friday, saturday],
    )
    assert.equal(units.length, 1)
    assert.equal(units[0]?.status, "sold")
  })
})
