import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  emptyEventDraftV2,
  eventDraftV2Schema,
  parseEventDraftV2,
} from "@/lib/validations/event-draft-v2"

describe("eventDraftV2Schema", () => {
  it("accepts any title, including empty, for JSON drafts", () => {
    assert.equal(eventDraftV2Schema.parse({ title: "After" }).title, "After")
    assert.equal(eventDraftV2Schema.parse({ title: "" }).title, "")
  })

  it("hydrates draft_state without inventing tickets or dropping extra keys", () => {
    assert.deepEqual(parseEventDraftV2({ title: "Fiesta", tickets: [] }), {
      title: "Fiesta",
      tickets: [],
    })
    assert.deepEqual(parseEventDraftV2(null), emptyEventDraftV2())
  })
})
