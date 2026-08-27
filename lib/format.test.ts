import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatCartTotal,
  formatCurrency,
  formatEventDay,
  formatEventTime,
  formatStoryEventDates,
  formatTicketPrice,
} from "@/lib/format"

describe("ticket prices", () => {
  it("keeps money formatting for admin totals", () => {
    assert.equal(formatCurrency(0), "$ 0")
    assert.equal(formatCartTotal(0), "$ 0")
    assert.equal(formatCartTotal(Number.NaN), "$ 0")
  })

  it("shows free tickets as Gratis", () => {
    assert.equal(formatTicketPrice(0), "Gratis")
    assert.equal(formatCurrency(0, { freeLabel: true }), "Gratis")
    assert.match(formatTicketPrice(1500), /1\.500|1500/)
  })
})

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

  it("formats a single story day without a clock time", () => {
    const label = formatStoryEventDates(["2026-11-12T15:00:00.000Z"])
    assert.match(label, /12/)
    assert.match(label, /2026/)
    assert.equal(label.includes(":"), false)
    assert.equal(/p\.?\s*m/i.test(label), false)
  })

  it("lists scattered november days and ranges consecutive ones", () => {
    assert.equal(
      formatStoryEventDates([
        "2026-11-08T15:00:00.000Z",
        "2026-11-14T15:00:00.000Z",
        "2026-11-15T15:00:00.000Z",
      ]),
      "8, 14 y 15 de Noviembre de 2026",
    )
    assert.equal(
      formatStoryEventDates([
        "2026-11-12T15:00:00.000Z",
        "2026-11-13T15:00:00.000Z",
        "2026-11-14T15:00:00.000Z",
        "2026-11-15T15:00:00.000Z",
      ]),
      "Del 12 al 15 de Noviembre de 2026",
    )
  })
})
