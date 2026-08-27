import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assertPublishedMapsMatchSchedule } from "@/lib/events/prepare-publish-draft-v2"

const friday = "550e8400-e29b-41d4-a716-446655440001"
const saturday = "550e8400-e29b-41d4-a716-446655440002"

describe("assertPublishedMapsMatchSchedule", () => {
  it("allows undated maps on a single-day event", () => {
    assert.doesNotThrow(() =>
      assertPublishedMapsMatchSchedule(
        [{ event_date_id: null, map_config: {}, pricing: {} }],
        [],
      ),
    )
  })

  it("rejects a multi-day publish whose map is not on the cronograma", () => {
    assert.throws(
      () =>
        assertPublishedMapsMatchSchedule(
          [{ event_date_id: null, map_config: {}, pricing: {} }],
          [
            { id: friday },
            { id: saturday },
          ],
        ),
      /jornada/,
    )
  })

  it("accepts one map per live jornada", () => {
    assert.doesNotThrow(() =>
      assertPublishedMapsMatchSchedule(
        [
          { event_date_id: friday, map_config: {}, pricing: {} },
          { event_date_id: saturday, map_config: {}, pricing: {} },
        ],
        [{ id: friday }, { id: saturday }],
      ),
    )
  })
})
