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
      occupancyPatchFromSeatingRow({ layout_item_id: "s-2", status: "held" }),
      { "s-2": "held" },
    )
    assert.equal(occupancyPatchFromSeatingRow(null), null)
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
})
