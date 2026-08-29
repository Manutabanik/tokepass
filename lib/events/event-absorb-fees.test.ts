import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  eventAbsorbFeesFromRow,
  overlayDraftAbsorbFees,
} from "@/lib/events/event-absorb-fees"

describe("eventAbsorbFeesFromRow", () => {
  it("only treats explicit true as absorb", () => {
    assert.equal(eventAbsorbFeesFromRow({ absorb_fees: true }), true)
    assert.equal(eventAbsorbFeesFromRow({ absorb_fees: false }), false)
    assert.equal(eventAbsorbFeesFromRow({ absorb_fees: null }), false)
    assert.equal(eventAbsorbFeesFromRow({}), false)
    assert.equal(eventAbsorbFeesFromRow(null), false)
  })
})

describe("overlayDraftAbsorbFees", () => {
  it("writes the column value onto the draft settings", () => {
    const draft = { settings: { absorbFees: false } }
    const next = overlayDraftAbsorbFees(draft, true)
    assert.equal(next.changed, true)
    assert.equal(next.draft.settings.absorbFees, true)
    assert.equal(draft.settings.absorbFees, false)
  })

  it("is a no-op when the draft already matches", () => {
    const draft = { settings: { absorbFees: false } }
    const next = overlayDraftAbsorbFees(draft, false)
    assert.equal(next.changed, false)
    assert.equal(next.draft, draft)
  })
})
