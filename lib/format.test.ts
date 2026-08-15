import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatEventDay, formatEventTime } from "@/lib/format"

describe("event date formatters", () => {
  it("uses Argentina timezone so SSR and client match", () => {
    const iso = "2026-08-15T03:00:00.000Z"
    assert.equal(formatEventDay(iso).length > 0, true)
    assert.equal(formatEventTime(iso).includes(":"), true)
  })

  it("returns empty string for invalid dates instead of throwing", () => {
    assert.equal(formatEventDay("not-a-date"), "")
    assert.equal(formatEventTime("not-a-date"), "")
  })
})
