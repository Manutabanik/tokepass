import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyTicketMatrixDayVariation,
  buildTicketPriceMatrix,
  copyTicketMatrixDay,
  nextMatrixTypeName,
} from "./ticket-price-matrix"

const days = [
  { id: "d1", title: "Viernes" },
  { id: "d2", title: "Sábado" },
]

describe("ticket price matrix", () => {
  it("groups same-named day tickets into one row with per-day cells", () => {
    const rows = buildTicketPriceMatrix(
      [
        {
          name: "General",
          dayId: "d1",
          price: 10000,
          capacity: 50,
          visibility: "public",
        },
        {
          name: "General",
          dayId: "d2",
          price: 12000,
          capacity: 40,
          visibility: "private",
        },
        { name: "Abono", dayId: null, price: 25000, capacity: 20 },
      ],
      days,
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.name, "General")
    assert.equal(rows[0]?.cells.d1?.enabled, true)
    assert.equal(rows[0]?.cells.d1?.price, 10000)
    assert.equal(rows[0]?.cells.d2?.enabled, false)
    assert.equal(rows[0]?.cells.d2?.capacity, 40)
  })

  it("copies day 1 price, stock and visibility onto the other days", () => {
    const tickets = [
      {
        name: "VIP",
        dayId: "d1",
        price: 20000,
        capacity: 15,
        visibility: "public" as const,
      },
      {
        name: "VIP",
        dayId: "d2",
        price: 1,
        capacity: 1,
        visibility: "private" as const,
      },
    ]
    const next = copyTicketMatrixDay(tickets, days, "d1", (source, dayId) => ({
      ...source,
      id: undefined,
      isNew: true,
      dayId,
    }))
    assert.equal(next[1]?.price, 20000)
    assert.equal(next[1]?.capacity, 15)
    assert.equal(next[1]?.visibility, "public")
  })

  it("applies a percent variation only to enabled tickets of that day", () => {
    const next = applyTicketMatrixDayVariation(
      [
        {
          name: "General",
          dayId: "d2",
          price: 10000,
          capacity: 10,
          visibility: "public",
        },
        {
          name: "VIP",
          dayId: "d2",
          price: 10000,
          capacity: 10,
          visibility: "private",
        },
      ],
      "d2",
      { kind: "percent", value: 15 },
    )
    assert.equal(next[0]?.price, 11500)
    assert.equal(next[1]?.price, 10000)
  })

  it("suggests a free type name when General already exists", () => {
    assert.equal(
      nextMatrixTypeName([{ name: "General", dayId: "d1" }]),
      "General 2",
    )
  })
})
