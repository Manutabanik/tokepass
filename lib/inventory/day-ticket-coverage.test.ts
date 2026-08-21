import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  duplicateTicketsFromDay,
  isDaySpecificTicket,
  isPassOrComboTicket,
  persistTicketDayId,
  scheduleDaysMissingTicketsMessage,
  uncoveredScheduleDays,
} from "@/lib/inventory/day-ticket-coverage"

const days = [
  { id: "d1", title: "Viernes" },
  { id: "d2", title: "Sábado" },
]

describe("day ticket coverage", () => {
  it("treats full-pass and bundle tickets as combos, not day tickets", () => {
    assert.equal(isPassOrComboTicket({ dayId: null, name: "Abono" }), true)
    assert.equal(isDaySpecificTicket({ dayId: null, name: "Abono" }), false)
    assert.equal(
      isPassOrComboTicket({
        dayId: "d1",
        name: "Pack",
        tierType: "bundle",
      }),
      true,
    )
    assert.equal(
      isDaySpecificTicket({ dayId: "d1", name: "General", visibility: "public" }),
      true,
    )
  })

  it("a full-pass covers every jornada even without a day ticket", () => {
    const tickets = [
      { name: "Abono", dayId: null, visibility: "public" },
      { name: "Sábado pausado", dayId: "d2", visibility: "private" },
    ]
    assert.deepEqual(uncoveredScheduleDays(days, tickets), [])
  })

  it("flags schedule days that lack an active ticket or pass", () => {
    const tickets = [
      { name: "Viernes", dayId: "d1", visibility: "public" },
      { name: "Sábado pausado", dayId: "d2", visibility: "private" },
    ]
    assert.deepEqual(
      uncoveredScheduleDays(days, tickets).map((day) => day.id),
      ["d2"],
    )
    assert.match(
      scheduleDaysMissingTicketsMessage(days, tickets) ?? "",
      /Sábado/,
    )
  })

  it("clones day tickets onto the target day without repeating names", () => {
    const tickets = [
      { name: "General", dayId: "d1", visibility: "public", sold: 4 },
      { name: "VIP", dayId: "d1", visibility: "public" },
      { name: "General", dayId: "d2", visibility: "public" },
      { name: "Abono", dayId: null, visibility: "public" },
    ]
    const result = duplicateTicketsFromDay(tickets, "d1", "d2")
    assert.equal(result.added, 1)
    assert.equal(result.tickets.at(-1)?.name, "VIP")
    assert.equal(result.tickets.at(-1)?.dayId, "d2")
    assert.equal(result.tickets.at(-1)?.isNew, true)
    assert.equal(result.tickets.at(-1)?.sold, 0)
  })

  it("persists day_id only on day tickets, never on combos", () => {
    assert.equal(
      persistTicketDayId(
        { dayId: "d1", name: "Viernes" },
        { isMultiDay: true, validDayIds: ["d1", "d2"] },
      ),
      "d1",
    )
    assert.equal(
      persistTicketDayId(
        { dayId: "d1", name: "Pack", tierType: "bundle" },
        { isMultiDay: true, validDayIds: ["d1", "d2"] },
      ),
      null,
    )
    assert.equal(
      persistTicketDayId(
        { dayId: null, name: "Abono" },
        { isMultiDay: true, validDayIds: ["d1", "d2"] },
      ),
      null,
    )
  })
})
