import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  collectMappedCheckoutLines,
  mappedLineDedupKey,
} from "./mapped-cart-lines"

const tierId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const friday = "550e8400-e29b-41d4-a716-446655440001"
const saturday = "550e8400-e29b-41d4-a716-446655440002"

describe("collectMappedCheckoutLines", () => {
  it("keeps the same mesa on two jornadas", () => {
    const lines = collectMappedCheckoutLines({
      scheduleDayCount: 2,
      selectedDateId: saturday,
      places: [
        { id: "mesa-09", ticketTierId: tierId, eventDateId: friday },
        { id: "mesa-09", ticketTierId: tierId, eventDateId: saturday },
      ],
    })
    assert.equal(lines.length, 2)
    assert.notEqual(
      mappedLineDedupKey(lines[0]!),
      mappedLineDedupKey(lines[1]!),
    )
  })

  it("does not stamp the active tab onto a place that has no jornada", () => {
    const lines = collectMappedCheckoutLines({
      scheduleDayCount: 2,
      selectedDateId: saturday,
      places: [{ id: "mesa-09", ticketTierId: tierId }],
    })
    assert.equal(lines.length, 0)
  })

  it("uses the selected day on a single-day event", () => {
    const lines = collectMappedCheckoutLines({
      scheduleDayCount: 1,
      selectedDateId: friday,
      places: [{ id: "mesa-09", ticketTierId: tierId }],
    })
    assert.equal(lines.length, 1)
    assert.equal(lines[0]?.eventDateId, friday)
  })
})
