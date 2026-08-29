import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  occupancyPatchFromRealtimePayload,
  occupancyPatchFromSeatingRow,
} from "@/lib/realtime/occupancy-patches"

describe("occupancyPatchFromSeatingRow", () => {
  it("maps live statuses and ignores empty rows", () => {
    assert.deepEqual(
      occupancyPatchFromSeatingRow({ layout_item_id: "s-1", status: "sold" }),
      { "s-1": "occupied" },
    )
    assert.deepEqual(
      occupancyPatchFromSeatingRow({
        id: "unit-1",
        layout_item_id: "s-1",
        status: "sold",
      }),
      { "s-1": "occupied", "unit-1": "occupied" },
    )
    assert.deepEqual(
      occupancyPatchFromSeatingRow({ layout_item_id: "s-2", status: "held" }),
      { "s-2": "held" },
    )
    assert.equal(occupancyPatchFromSeatingRow(null), null)
  })

  it("drops occupancy from another jornada on multi-day events", () => {
    assert.equal(
      occupancyPatchFromSeatingRow(
        {
          layout_item_id: "mesa-09",
          status: "sold",
          event_date_id: "day-fri",
        },
        { eventDateId: "day-sat", scheduleDayCount: 2 },
      ),
      null,
    )
    assert.deepEqual(
      occupancyPatchFromSeatingRow(
        {
          layout_item_id: "mesa-09",
          status: "sold",
          event_date_id: "day-sat",
        },
        { eventDateId: "day-sat", scheduleDayCount: 2 },
      ),
      { "mesa-09": "occupied" },
    )
  })

  it("ignores undated occupancy when a jornada is selected on multi-day", () => {
    assert.equal(
      occupancyPatchFromSeatingRow(
        { layout_item_id: "mesa-09", status: "sold" },
        { eventDateId: "day-sat", scheduleDayCount: 2 },
      ),
      null,
    )
  })
})

describe("occupancyPatchFromRealtimePayload", () => {
  it("frees a seat when the occupancy row is deleted", () => {
    assert.deepEqual(
      occupancyPatchFromRealtimePayload({
        eventType: "DELETE",
        old: { layout_item_id: "s-1", status: "sold" },
      }),
      { "s-1": "available" },
    )
  })

  it("does not free Saturday when Friday occupancy is deleted", () => {
    assert.equal(
      occupancyPatchFromRealtimePayload(
        {
          eventType: "DELETE",
          old: {
            layout_item_id: "mesa-09",
            status: "sold",
            event_date_id: "day-fri",
          },
        },
        { eventDateId: "day-sat", scheduleDayCount: 2 },
      ),
      null,
    )
  })
})
