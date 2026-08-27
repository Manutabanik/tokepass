import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyCartDayStamp,
  applyCartSeatLabel,
  cartItemDateString,
  cartItemScheduleId,
  cartItemSeatLabel,
  resolveCartDayStamp,
} from "./cart-line-stamp"

const friday = "550e8400-e29b-41d4-a716-446655440001"
const saturday = "550e8400-e29b-41d4-a716-446655440002"

describe("cart line stamp", () => {
  it("reads the stamped jornada and ignores a later tab id", () => {
    const item = applyCartDayStamp(
      { id: "mesa-04", name: "Grada Naranja" },
      { scheduleId: friday, dateString: "Viernes 13 Nov" },
    )
    assert.equal(cartItemScheduleId(item), friday)
    assert.equal(cartItemDateString(item), "Viernes 13 Nov")
    assert.equal(
      cartItemScheduleId({ ...item, dateId: saturday }),
      friday,
    )
    assert.equal(
      resolveCartDayStamp({
        scheduleId: friday,
        dateId: saturday,
        dateLabel: "Sábado 14 Nov",
        dateString: "Viernes 13 Nov",
      }).dateString,
      "Viernes 13 Nov",
    )
  })

  it("does not invent a jornada from an empty stamp", () => {
    assert.equal(cartItemScheduleId({ dateId: "full_pass" }), null)
    assert.equal(cartItemDateString({ dateLabel: "  " }), null)
  })

  it("prefers the explicit seat label over a formatted fallback", () => {
    const item = applyCartSeatLabel(
      { type: "table", number: 4, name: "Grada Naranja" },
      "Mesa 04",
    )
    assert.equal(cartItemSeatLabel(item), "Mesa 04")
    assert.equal(
      cartItemSeatLabel({ type: "table", number: 4, name: "Grada Naranja" }),
      "Mesa 04",
    )
  })
})
