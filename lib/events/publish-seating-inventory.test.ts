import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  seatingMapsFromSavedVenueMap,
  venueLayoutDrivesSeatingUnits,
} from "./publish-seating-inventory"

describe("venueLayoutDrivesSeatingUnits", () => {
  it("lets a single-day venue-only event rematerialize from the venue layout", () => {
    assert.equal(
      venueLayoutDrivesSeatingUnits({
        scheduleDayCount: 1,
        hasPublishedSeatingMaps: false,
      }),
      true,
    )
  })

  it("never rematerializes a multi-day event from the venue layout", () => {
    assert.equal(
      venueLayoutDrivesSeatingUnits({
        scheduleDayCount: 2,
        hasPublishedSeatingMaps: false,
      }),
      false,
    )
  })

  it("never rematerializes an event that already has published maps", () => {
    assert.equal(
      venueLayoutDrivesSeatingUnits({
        scheduleDayCount: 1,
        hasPublishedSeatingMaps: true,
      }),
      false,
    )
  })
})

describe("seatingMapsFromSavedVenueMap", () => {
  const mapConfig = { version: 1 } as never
  const seatingLayout = [] as never

  it("binds the saved map to the only jornada", () => {
    const day = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const result = seatingMapsFromSavedVenueMap({
      mapConfig,
      seatingLayout,
      scheduleDayIds: [day],
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.maps[0]?.event_date_id, day)
    assert.equal(result.maps[0]?.map_config, mapConfig)
  })

  it("writes an undated map when the event has no schedule yet", () => {
    const result = seatingMapsFromSavedVenueMap({
      mapConfig,
      seatingLayout,
      scheduleDayIds: [],
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.maps[0]?.event_date_id, null)
  })

  it("refuses to stamp one map onto every jornada", () => {
    assert.deepEqual(
      seatingMapsFromSavedVenueMap({
        mapConfig,
        seatingLayout,
        scheduleDayIds: [
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        ],
      }),
      { ok: false, reason: "multi_day" },
    )
  })
})
