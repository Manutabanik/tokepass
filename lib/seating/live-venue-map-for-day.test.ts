import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveLiveVenueMapForDay } from "./live-venue-map-for-day"
import { venueMap, venueZone } from "@/tests/fixtures/venue-map"

const friday = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const saturday = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function map(zoneId: string) {
  return venueMap({ zones: [venueZone({ id: zoneId, name: zoneId })] })
}

describe("resolveLiveVenueMapForDay", () => {
  it("uses the jornada map and never the other day's fallback", () => {
    const live = resolveLiveVenueMapForDay({
      selectedDateId: saturday,
      scheduleDayCount: 2,
      seatingMaps: [
        { eventDateId: friday, map: map("viernes") },
        { eventDateId: saturday, map: map("sabado") },
      ],
      fallback: map("global"),
    })
    assert.equal(live?.zones[0]?.id, "sabado")
  })

  it("does not show Friday's map when Saturday is selected and missing", () => {
    const live = resolveLiveVenueMapForDay({
      selectedDateId: saturday,
      scheduleDayCount: 2,
      seatingMaps: [{ eventDateId: friday, map: map("viernes") }],
      fallback: map("global"),
    })
    assert.equal(live, null)
  })

  it("keeps the venue map on a single-day event", () => {
    const live = resolveLiveVenueMapForDay({
      scheduleDayCount: 1,
      fallback: map("global"),
    })
    assert.equal(live?.zones[0]?.id, "global")
  })

  it("uses the dated published map on a single-day event", () => {
    const live = resolveLiveVenueMapForDay({
      selectedDateId: friday,
      scheduleDayCount: 1,
      seatingMaps: [{ eventDateId: friday, map: map("publicado") }],
      fallback: map("global"),
    })
    assert.equal(live?.zones[0]?.id, "publicado")
  })
})
