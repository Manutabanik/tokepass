import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  eventDraftV2Schema,
  parseEventDraftV2,
} from "@/lib/validations/event-draft-v2"

describe("eventDraftV2Schema", () => {
  it("accepts a title and rejects an empty draft", () => {
    assert.equal(eventDraftV2Schema.parse({ title: "After" }).title, "After")
    assert.equal(eventDraftV2Schema.safeParse({ title: "  " }).success, false)
  })

  it("reads title from raw draft_state without inventing tickets", () => {
    assert.deepEqual(parseEventDraftV2({ title: "Fiesta", tickets: [] }), {
      title: "Fiesta",
    })
    assert.deepEqual(parseEventDraftV2(null), { title: "" })
  })
})
