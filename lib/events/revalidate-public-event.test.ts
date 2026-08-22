import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { publicEventSlugsForRevalidate } from "@/lib/events/public-event-slugs"

describe("publicEventSlugsForRevalidate", () => {
  it("keeps the new slug, the previous slug and the event id", () => {
    assert.deepEqual(
      publicEventSlugsForRevalidate("fiesta-nueva", "fiesta-vieja", "evt-1"),
      ["fiesta-nueva", "fiesta-vieja", "evt-1"],
    )
  })

  it("drops blanks and duplicates", () => {
    assert.deepEqual(
      publicEventSlugsForRevalidate("fiesta", "  fiesta  ", "", null),
      ["fiesta"],
    )
  })
})
